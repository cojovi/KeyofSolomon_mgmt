import type { APIResponse } from "./types";

let _token: string | null = null;
let _apiBase = "/api/v1";
let _configFetched = false;

export async function initConfig(): Promise<void> {
  if (_configFetched) return;
  try {
    const res = await fetch("/ui-config");
    const json = await res.json();
    if (json.success) {
      _token = json.data.token;
      _apiBase = json.data.apiBase;
    }
  } catch {
    // dev mode: try env token
    _token = import.meta.env.VITE_API_TOKEN ?? null;
  }
  _configFetched = true;
}

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) h["Authorization"] = `Bearer ${_token}`;
  return h;
}

export class APIError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  await initConfig();
  const res = await fetch(`${_apiBase}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers ?? {}) },
  });
  const json: APIResponse<T> = await res.json();
  if (!json.success || json.error) {
    throw new APIError(
      res.status,
      json.error?.code ?? "ERROR",
      json.error?.message ?? "Unknown error",
    );
  }
  return json.data;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: { type: string; data: any }) => void,
): Promise<void> {
  await initConfig();
  const res = await fetch(`${_apiBase}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    let json: any = null;
    try { json = await res.json(); } catch {}
    throw new APIError(res.status, json?.error?.code || "STREAM_ERROR", json?.error?.message || "Stream request failed");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "message";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim() || "message";
      } else if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try { onEvent({ type: eventType, data: JSON.parse(raw) }); } catch {}
        eventType = "message";
      }
    }
    if (done) break;
  }
}

export interface SSEEvent {
  type: string;
  data?: unknown;
  [key: string]: unknown;
}

// SSE connection — returns a cleanup function
export function connectSSE(
  onEvent: (event: SSEEvent) => void,
  token?: string,
): () => void {
  const t = token ?? _token;
  const url = `${_apiBase}/events${t ? `?token=${t}` : ""}`;
  let es: EventSource;
  let retryTimer: ReturnType<typeof setTimeout>;
  let dead = false;

  function connect() {
    if (dead) return;
    es = new EventSource(url);
    // Generic message
    es.onmessage = (e) => {
      try { onEvent({ type: "message", ...JSON.parse(e.data) }); } catch {}
    };
    // Named events the server emits
    const EVENT_TYPES = [
      "data-changed", "project_updated", "task_updated",
      "idea_updated", "agent_action", "approval_requested", "ping",
      "approval_resolved", "notification_created",
    ];
    for (const evType of EVENT_TYPES) {
      es.addEventListener(evType, (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          onEvent({ type: evType, ...payload });
        } catch {
          onEvent({ type: evType });
        }
      });
    }
    es.onerror = () => {
      es.close();
      if (!dead) retryTimer = setTimeout(connect, 5000);
    };
  }

  connect();
  return () => {
    dead = true;
    clearTimeout(retryTimer);
    es?.close();
  };
}

export function getToken() { return _token; }
