import type { Response } from "express";
import { db } from "./db.js";
import { makeId, now } from "./helpers.js";
import { createNotification } from "./notifications.js";

const CONVERSATION_ID = "gordon-main";
const MAX_MESSAGE_LENGTH = 8_000;
const CHAT_TIMEOUT_MS = 5 * 60_000;

export type ChatStatus = "complete" | "streaming" | "failed";

export interface GordonChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: ChatStatus;
  replyToId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

let activeTurn = false;

export function gordonChatConfig() {
  const baseUrl = process.env.OPENCLAW_GATEWAY_BASE_URL?.trim().replace(/\/$/, "") || "";
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || "";
  const enabled = process.env.OPENCLAW_GATEWAY_CHAT_ENABLED === "true";
  let validUrl = false;
  try {
    const url = new URL(baseUrl);
    validUrl = url.protocol === "https:" || url.protocol === "http:";
  } catch {}
  return { baseUrl, token, enabled, configured: validUrl && !!token };
}

export function maskedGordonChatDestination(): string | null {
  const { baseUrl } = gordonChatConfig();
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).host;
  } catch {
    return "invalid-url";
  }
}

export function listGordonChatMessages(limit = 100): GordonChatMessage[] {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const rows = db.prepare(
    `SELECT * FROM gordon_chat_messages WHERE conversationId = ?
     ORDER BY createdAt DESC LIMIT ?`
  ).all(CONVERSATION_ID, safeLimit) as GordonChatMessage[];
  return rows.reverse();
}

export function gordonChatStatus() {
  const config = gordonChatConfig();
  const latest = db.prepare(
    `SELECT status, updatedAt, error FROM gordon_chat_messages
     WHERE role = 'assistant' ORDER BY createdAt DESC LIMIT 1`
  ).get() as { status: ChatStatus; updatedAt: string; error: string | null } | undefined;
  return {
    enabled: config.enabled,
    configured: config.configured,
    destination: maskedGordonChatDestination(),
    busy: activeTurn,
    latest: latest || null,
  };
}

function insertMessage(message: GordonChatMessage) {
  db.prepare(
    `INSERT INTO gordon_chat_messages
      (id, conversationId, role, content, status, replyToId, error, createdAt, updatedAt, completedAt)
     VALUES (@id, @conversationId, @role, @content, @status, @replyToId, @error, @createdAt, @updatedAt, @completedAt)`
  ).run(message);
}

function safeUpstreamError(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "OpenClaw chat timed out";
  if (error instanceof Error && error.name === "AbortError") return "OpenClaw chat timed out";
  return "OpenClaw chat connection failed";
}

function writeEvent(res: Response, event: string, data: unknown) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

function assistantDelta(payload: any): string {
  const content = payload?.choices?.[0]?.delta?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part?.text === "string" ? part.text : "").join("");
  }
  return "";
}

export type StartChatResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export async function streamGordonChat(
  input: { message?: unknown; retryMessageId?: unknown },
  res: Response,
): Promise<StartChatResult> {
  const config = gordonChatConfig();
  if (!config.enabled || !config.configured) {
    return { ok: false, status: 503, code: "CHAT_NOT_CONFIGURED", message: "Gordon chat is not configured" };
  }
  if (activeTurn) {
    return { ok: false, status: 409, code: "CHAT_BUSY", message: "Gordon is already responding to another message" };
  }

  let userMessage: GordonChatMessage;
  const retryId = typeof input.retryMessageId === "string" ? input.retryMessageId : "";
  if (retryId) {
    const existing = db.prepare(
      "SELECT * FROM gordon_chat_messages WHERE id = ? AND conversationId = ? AND role = 'user'"
    ).get(retryId, CONVERSATION_ID) as GordonChatMessage | undefined;
    if (!existing) {
      return { ok: false, status: 404, code: "NOT_FOUND", message: "The chat message to retry was not found" };
    }
    userMessage = existing;
  } else {
    const content = typeof input.message === "string" ? input.message.trim() : "";
    if (!content) {
      return { ok: false, status: 400, code: "VALIDATION_ERROR", message: "message is required" };
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, status: 400, code: "VALIDATION_ERROR", message: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` };
    }
    const timestamp = now();
    userMessage = {
      id: makeId("chat"), conversationId: CONVERSATION_ID, role: "user", content,
      status: "complete", replyToId: null, error: null,
      createdAt: timestamp, updatedAt: timestamp, completedAt: timestamp,
    };
    insertMessage(userMessage);
  }

  const timestamp = now();
  const assistantMessage: GordonChatMessage = {
    id: makeId("chat"), conversationId: CONVERSATION_ID, role: "assistant", content: "",
    status: "streaming", replyToId: userMessage.id, error: null,
    createdAt: timestamp, updatedAt: timestamp, completedAt: null,
  };
  insertMessage(assistantMessage);
  activeTurn = true;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  writeEvent(res, "message", { user: userMessage, assistant: assistantMessage });

  let content = "";
  let buffer = "";
  let lastCheckpointAt = Date.now();
  let checkpointLength = 0;
  try {
    const upstream = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "x-openclaw-message-channel": "key-of-solomon",
      },
      body: JSON.stringify({
        model: "openclaw/main",
        user: "key-of-solomon:gordon-main",
        stream: true,
        messages: [{ role: "user", content: userMessage.content }],
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    if (!upstream.ok || !upstream.body) throw new Error(`upstream status ${upstream.status}`);

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      finished = done;
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const delta = assistantDelta(JSON.parse(data));
          if (!delta) continue;
          content += delta;
          writeEvent(res, "delta", { id: assistantMessage.id, delta });
          const checkpointDue = Date.now() - lastCheckpointAt >= 1_000 || content.length - checkpointLength >= 4_096;
          if (checkpointDue) {
            db.prepare(
              "UPDATE gordon_chat_messages SET content = ?, updatedAt = ? WHERE id = ?"
            ).run(content, now(), assistantMessage.id);
            lastCheckpointAt = Date.now();
            checkpointLength = content.length;
          }
        } catch {}
      }
    }

    const completedAt = now();
    db.prepare(
      `UPDATE gordon_chat_messages
       SET content = ?, status = 'complete', error = NULL, updatedAt = ?, completedAt = ? WHERE id = ?`
    ).run(content, completedAt, completedAt, assistantMessage.id);
    const completed = db.prepare("SELECT * FROM gordon_chat_messages WHERE id = ?").get(assistantMessage.id);
    createNotification({
      type: "gordon_chat_reply", severity: "info", title: "Gordon replied",
      body: content.slice(0, 240), actor: "Gordon", dedupeKey: `gordon_chat_reply:${assistantMessage.id}`,
    });
    writeEvent(res, "done", { message: completed });
  } catch (error) {
    const message = safeUpstreamError(error);
    const failedAt = now();
    db.prepare(
      `UPDATE gordon_chat_messages
       SET content = ?, status = 'failed', error = ?, updatedAt = ?, completedAt = ? WHERE id = ?`
    ).run(content, message, failedAt, failedAt, assistantMessage.id);
    writeEvent(res, "error", { id: assistantMessage.id, code: "OPENCLAW_CHAT_FAILED", message, retryable: true });
  } finally {
    activeTurn = false;
    if (!res.writableEnded) res.end();
  }
  return { ok: true };
}
