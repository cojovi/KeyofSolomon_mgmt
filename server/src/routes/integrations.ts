import { Router } from "express";
import { fail, ok } from "../helpers.js";
import {
  openClawStatus, processOpenClawQueue, queueOpenClawEvent,
} from "../openclaw.js";
import {
  gordonChatStatus, listGordonChatMessages, streamGordonChat,
} from "../gordon-chat.js";

export const integrationsRouter = Router();

integrationsRouter.get("/openclaw/status", (_req, res) => {
  ok(res, { ...openClawStatus(), chat: gordonChatStatus() });
});

integrationsRouter.post("/openclaw/test", async (_req, res) => {
  const eventId = queueOpenClawEvent({
    eventType: "integration.test",
    entityType: "integration",
    priority: "immediate",
    dedupeKey: `integration.test:${Date.now()}`,
  });
  await processOpenClawQueue();
  ok(res, { eventId, integration: openClawStatus() }, 202);
});

integrationsRouter.get("/openclaw/chat/messages", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 100);
  ok(res, listGordonChatMessages(limit));
});

integrationsRouter.post("/openclaw/chat/stream", async (req, res) => {
  const result = await streamGordonChat(req.body || {}, res);
  if (!result.ok && !res.headersSent) return fail(res, result.status, result.code, result.message);
});
