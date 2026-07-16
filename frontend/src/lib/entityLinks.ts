import type { AppNotification } from "./types";

export function entityPath(type?: string | null, id?: string | null): string | null {
  if (!type || !id) return null;
  if (type === "task") return `/app/tasks/${id}`;
  if (type === "project") return `/app/projects/${id}`;
  if (type === "idea") return `/app/ideas/${id}`;
  if (type === "approval") return "/app/agent#approvals";
  if (type === "integration") return "/app/agent";
  return null;
}

export function notificationPath(notification: AppNotification): string {
  if (notification.type === "gordon_chat_reply") return "/app/agent#chat";
  if (notification.type === "approval_requested") return "/app/agent#approvals";
  return entityPath(notification.targetType, notification.targetId) || "/app/agent";
}
