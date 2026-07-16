import { db } from "./db.js";
import { queueOpenClawEvent } from "./openclaw.js";
import { emitSSE } from "./sse.js";

/**
 * Broadcast an SSE event to all connected dashboard/control-panel clients.
 * Event types: "data-changed" (entity mutated), "ping" (keepalive).
 */
export function publishDomainEvent(type: string, payload: Record<string, unknown> = {}) {
  emitSSE(type, payload);

  if (type !== "data-changed") return;
  const entity = typeof payload.entity === "string" ? payload.entity : "";
  const id = typeof payload.id === "string" ? payload.id : undefined;
  const op = typeof payload.op === "string" ? payload.op : "update";
  const origin = typeof payload.by === "string" ? payload.by.toLowerCase() : "user";
  if (!["task", "project", "idea", "approval"].includes(entity)) return;
  if (["agent", "gordon", "openclaw"].includes(origin)) return;

  let immediate = entity === "approval" && ["approved", "rejected"].includes(op);
  if (id && ["task", "project"].includes(entity)) {
    const table = entity === "task" ? "tasks" : "projects";
    const row = db.prepare(`SELECT status, priority FROM ${table} WHERE id = ?`).get(id) as any;
    immediate ||= row?.status === "blocked" || row?.priority === "urgent";
  }
  queueOpenClawEvent({
    eventType: `${entity}.${op}`,
    entityType: entity,
    entityId: id,
    priority: immediate ? "immediate" : "normal",
  });
}

// Backward-compatible name used by existing route modules.
export const broadcast = publishDomainEvent;

// keepalive every 25s so proxies/browsers don't kill the stream
setInterval(() => publishDomainEvent("ping"), 25000).unref();
