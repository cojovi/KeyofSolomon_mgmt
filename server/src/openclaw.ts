import { db } from "./db.js";
import { makeId, now } from "./helpers.js";
import { createNotification } from "./notifications.js";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [10_000, 60_000, 5 * 60_000, 30 * 60_000, 60 * 60_000];

export interface GordonEvent {
  eventType: string;
  entityType?: string;
  entityId?: string;
  priority?: "normal" | "immediate";
  occurredAt?: string;
  dedupeKey?: string;
}

export function openClawConfig() {
  const url = process.env.OPENCLAW_SOLOMON_WEBHOOK_URL?.trim() || "";
  const token = process.env.OPENCLAW_HOOK_TOKEN?.trim() || "";
  const enabled = process.env.OPENCLAW_WEBHOOK_ENABLED === "true";
  return { url, token, enabled, configured: !!url && !!token };
}

export function maskedOpenClawDestination(): string | null {
  const { url } = openClawConfig();
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

export function queueOpenClawEvent(event: GordonEvent): string | null {
  const config = openClawConfig();
  if (!config.enabled || !config.configured) return null;
  const id = makeId("hook");
  const createdAt = event.occurredAt || now();
  const payload = {
    text: "Key of Solomon event ready. Fetch authoritative details through the scoped agent API.",
    eventId: id,
    eventType: event.eventType,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    priority: event.priority || "normal",
    occurredAt: createdAt,
  };
  const dedupeKey = event.dedupeKey || [event.eventType, event.entityType || "none", event.entityId || "all"].join(":");
  const result = db.prepare(
    `INSERT OR IGNORE INTO webhook_outbox
      (id, eventType, entityType, entityId, payload, priority, status, attempts, nextAttemptAt, createdAt, deliveredAt, lastError, dedupeKey)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, NULL, NULL, ?)`
  ).run(
    id, event.eventType, event.entityType ?? null, event.entityId ?? null,
    JSON.stringify(payload), event.priority || "normal", createdAt, createdAt, dedupeKey,
  );
  return result.changes ? id : null;
}

type OutboxRow = {
  id: string;
  payload: string;
  attempts: number;
};

let draining = false;

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return `network error: ${error.name}`;
  return "network error";
}

async function deliverRow(row: OutboxRow) {
  const config = openClawConfig();
  if (!config.enabled || !config.configured) return;
  db.prepare("UPDATE webhook_outbox SET status = 'delivering' WHERE id = ?").run(row.id);

  let responseStatus: number | null = null;
  let errorText: string | null = null;
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: row.payload,
      signal: AbortSignal.timeout(10_000),
    });
    responseStatus = response.status;
    if (response.ok) {
      db.prepare(
        "UPDATE webhook_outbox SET status = 'delivered', attempts = attempts + 1, deliveredAt = ?, lastError = NULL WHERE id = ?"
      ).run(now(), row.id);
      return;
    }
    errorText = `HTTP ${response.status}`;
  } catch (error) {
    errorText = safeError(error);
  }

  const attempts = row.attempts + 1;
  const canRetry = attempts < MAX_ATTEMPTS && (responseStatus === null || retryableStatus(responseStatus));
  if (canRetry) {
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
    db.prepare(
      "UPDATE webhook_outbox SET status = 'queued', attempts = ?, nextAttemptAt = ?, lastError = ? WHERE id = ?"
    ).run(attempts, new Date(Date.now() + delay).toISOString(), errorText, row.id);
  } else {
    db.prepare(
      "UPDATE webhook_outbox SET status = 'failed', attempts = ?, lastError = ? WHERE id = ?"
    ).run(attempts, errorText, row.id);
    createNotification({
      type: "integration_failed",
      severity: "error",
      title: "OpenClaw delivery failed",
      body: "A Gordon webhook event exhausted its delivery retries.",
      targetType: "integration",
      targetId: row.id,
      actor: "system",
      dedupeKey: `integration_failed:${row.id}`,
    });
  }
}

export async function processOpenClawQueue() {
  if (draining) return;
  const config = openClawConfig();
  if (!config.enabled || !config.configured) return;
  draining = true;
  try {
    const rows = db.prepare(
      `SELECT id, payload, attempts FROM webhook_outbox
       WHERE status = 'queued' AND nextAttemptAt <= ?
       ORDER BY CASE priority WHEN 'immediate' THEN 0 ELSE 1 END, createdAt ASC LIMIT 10`
    ).all(now()) as OutboxRow[];
    for (const row of rows) await deliverRow(row);
  } finally {
    draining = false;
  }
}

export function startOpenClawDispatcher() {
  void processOpenClawQueue();
  return setInterval(() => void processOpenClawQueue(), 5_000).unref();
}

export function openClawStatus() {
  const config = openClawConfig();
  const counts = Object.fromEntries(
    (db.prepare("SELECT status, COUNT(*) AS count FROM webhook_outbox GROUP BY status").all() as any[])
      .map((row) => [row.status, row.count])
  );
  const latest = db.prepare(
    `SELECT id, eventType, entityType, entityId, priority, status, attempts, createdAt, deliveredAt, lastError
     FROM webhook_outbox ORDER BY createdAt DESC LIMIT 1`
  ).get() as any;
  return {
    enabled: config.enabled,
    configured: config.configured,
    destination: maskedOpenClawDestination(),
    queue: {
      queued: counts.queued || 0,
      delivering: counts.delivering || 0,
      delivered: counts.delivered || 0,
      failed: counts.failed || 0,
    },
    latest: latest || null,
  };
}
