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
