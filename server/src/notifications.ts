import { db } from "./db.js";
import { makeId, now } from "./helpers.js";
import { emitSSE } from "./sse.js";

export type NotificationSeverity = "info" | "success" | "attention" | "error";

export interface AppNotification {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  targetType: string | null;
  targetId: string | null;
  actor: string;
  dedupeKey: string;
  createdAt: string;
  readAt: string | null;
}

export function createNotification(input: {
  type: string;
  severity?: NotificationSeverity;
  title: string;
  body?: string;
  targetType?: string;
  targetId?: string;
  actor?: string;
  dedupeKey: string;
}): AppNotification | null {
  const notification: AppNotification = {
    id: makeId("notif"),
    type: input.type,
    severity: input.severity || "info",
    title: input.title,
    body: input.body?.trim() || null,
    targetType: input.targetType || null,
    targetId: input.targetId || null,
    actor: input.actor || "system",
    dedupeKey: input.dedupeKey,
    createdAt: now(),
    readAt: null,
  };
  const result = db.prepare(
    `INSERT OR IGNORE INTO notifications
      (id, type, severity, title, body, targetType, targetId, actor, dedupeKey, createdAt, readAt)
     VALUES (@id, @type, @severity, @title, @body, @targetType, @targetId, @actor, @dedupeKey, @createdAt, @readAt)`
  ).run(notification);
  if (!result.changes) return null;
  emitSSE("notification_created", { notification });
  return notification;
}

export function listNotifications(limit = 50, unread?: boolean): AppNotification[] {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const where = unread === undefined ? "" : unread ? "WHERE readAt IS NULL" : "WHERE readAt IS NOT NULL";
  return db.prepare(
    `SELECT * FROM notifications ${where} ORDER BY createdAt DESC LIMIT ?`
  ).all(safeLimit) as AppNotification[];
}

export function markNotificationRead(id: string): AppNotification | undefined {
  db.prepare("UPDATE notifications SET readAt = COALESCE(readAt, ?) WHERE id = ?").run(now(), id);
  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as AppNotification | undefined;
}

export function markAllNotificationsRead() {
  const result = db.prepare("UPDATE notifications SET readAt = ? WHERE readAt IS NULL").run(now());
  return result.changes;
}
