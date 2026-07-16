import { Router } from "express";
import { fail, ok } from "../helpers.js";
import {
  listNotifications, markAllNotificationsRead, markNotificationRead,
} from "../notifications.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const unread = req.query.unread === "true" ? true : req.query.unread === "false" ? false : undefined;
  ok(res, listNotifications(limit, unread));
});

notificationsRouter.post("/read-all", (_req, res) => {
  ok(res, { updated: markAllNotificationsRead() });
});

notificationsRouter.post("/:id/read", (req, res) => {
  const notification = markNotificationRead(req.params.id);
  if (!notification) return fail(res, 404, "NOT_FOUND", "Notification not found");
  ok(res, notification);
});
