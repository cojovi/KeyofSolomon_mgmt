import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

const tempDir = mkdtempSync(join(tmpdir(), "solomon-interactive-test-"));
process.env.DATABASE_PATH = join(tempDir, "test.db");
process.env.LOCAL_API_TOKEN = "full-interactive-token";
process.env.GORDON_API_TOKEN = "gordon-interactive-token";
process.env.OPENCLAW_GATEWAY_CHAT_ENABLED = "true";
process.env.OPENCLAW_GATEWAY_TOKEN = "gateway-owner-token";

const gatewayRequests: Array<{ authorization?: string; channel?: string; body: any }> = [];
const gatewayServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    const body = JSON.parse(raw);
    gatewayRequests.push({
      authorization: req.headers.authorization,
      channel: req.headers["x-openclaw-message-channel"] as string | undefined,
      body,
    });
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = () => {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hello " } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "from Gordon" } }] })}\n\n`);
      res.end("data: [DONE]\n\n");
    };
    if (body.messages?.[0]?.content === "slow") setTimeout(send, 150);
    else send();
  });
});
await new Promise<void>((resolve) => gatewayServer.listen(0, "127.0.0.1", resolve));
const gatewayAddress = gatewayServer.address();
if (!gatewayAddress || typeof gatewayAddress === "string") throw new Error("Gateway did not start");
process.env.OPENCLAW_GATEWAY_BASE_URL = `http://127.0.0.1:${gatewayAddress.port}`;

const { db } = await import("../src/db.js");
const { authMiddleware } = await import("../src/helpers.js");
const { agentRouter } = await import("../src/routes/agent.js");
const { integrationsRouter } = await import("../src/routes/integrations.js");
const { notificationsRouter } = await import("../src/routes/notifications.js");
const { approvalsRouter, settingsRouter } = await import("../src/routes/misc.js");

const app = express();
app.use(express.json());
const api = express.Router();
api.use(authMiddleware);
api.use("/agent", agentRouter);
api.use("/approvals", approvalsRouter);
api.use("/integrations", integrationsRouter);
api.use("/notifications", notificationsRouter);
api.use("/settings", settingsRouter);
app.use("/api/v1", api);
const apiServer = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => apiServer.once("listening", resolve));
const apiAddress = apiServer.address();
if (!apiAddress || typeof apiAddress === "string") throw new Error("API did not start");
const apiBase = `http://127.0.0.1:${apiAddress.port}/api/v1`;

function apiFetch(path: string, token: string, options: RequestInit = {}) {
  return fetch(`${apiBase}${path}`, {
    ...options,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

after(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("schema migrations are idempotent and include interactive records", () => {
  const approvalColumns = db.prepare("PRAGMA table_info(agent_approvals)").all() as any[];
  assert.ok(approvalColumns.some((column) => column.name === "resolutionNote"));
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('notifications','gordon_chat_messages') ORDER BY name"
  ).all() as any[];
  assert.deepEqual(tables.map((row) => row.name), ["gordon_chat_messages", "notifications"]);
});

test("chat proxy fixes the Gordon target, streams, persists, and protects the Gateway credential", async () => {
  const forbidden = await apiFetch("/integrations/openclaw/chat/messages", "gordon-interactive-token");
  assert.equal(forbidden.status, 403);

  const response = await apiFetch("/integrations/openclaw/chat/stream", "full-interactive-token", {
    method: "POST", body: JSON.stringify({ message: "hello", model: "not-allowed", system: "not-allowed" }),
  });
  assert.equal(response.status, 200);
  const stream = await response.text();
  assert.match(stream, /event: delta/);
  assert.match(stream, /Hello/);
  assert.match(stream, /event: done/);

  assert.equal(gatewayRequests.length, 1);
  assert.equal(gatewayRequests[0].authorization, "Bearer gateway-owner-token");
  assert.equal(gatewayRequests[0].channel, "key-of-solomon");
  assert.equal(gatewayRequests[0].body.model, "openclaw/main");
  assert.equal(gatewayRequests[0].body.user, "key-of-solomon:gordon-main");
  assert.equal(gatewayRequests[0].body.messages.length, 1);
  assert.equal(JSON.stringify(gatewayRequests[0].body).includes("not-allowed"), false);

  const history = await apiFetch("/integrations/openclaw/chat/messages", "full-interactive-token");
  const historyBody = await history.json() as any;
  assert.equal(historyBody.data.length, 2);
  assert.equal(historyBody.data[1].content, "Hello from Gordon");
  assert.equal(historyBody.data[1].status, "complete");

  const status = await apiFetch("/integrations/openclaw/status", "full-interactive-token");
  const statusBody = await status.json() as any;
  assert.equal(statusBody.data.chat.destination, `127.0.0.1:${gatewayAddress.port}`);
  assert.equal(JSON.stringify(statusBody.data).includes("gateway-owner-token"), false);
});

test("chat validates length and rejects concurrent turns", async () => {
  const oversized = await apiFetch("/integrations/openclaw/chat/stream", "full-interactive-token", {
    method: "POST", body: JSON.stringify({ message: "x".repeat(8_001) }),
  });
  assert.equal(oversized.status, 400);

  const first = await apiFetch("/integrations/openclaw/chat/stream", "full-interactive-token", {
    method: "POST", body: JSON.stringify({ message: "slow" }),
  });
  const second = await apiFetch("/integrations/openclaw/chat/stream", "full-interactive-token", {
    method: "POST", body: JSON.stringify({ message: "second" }),
  });
  assert.equal(second.status, 409);
  const secondBody = await second.json() as any;
  assert.equal(secondBody.error.code, "CHAT_BUSY");
  await first.text();
});

test("approvals expose target context, retain decision notes, and create notifications", async () => {
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO tasks (id, title, source, status, tags, agentCandidate, createdAt, updatedAt)
     VALUES ('task_approval_target', 'Approval target', 'user', 'todo', '[]', 0, ?, ?)`
  ).run(timestamp, timestamp);

  const created = await apiFetch("/agent/approvals", "gordon-interactive-token", {
    method: "POST",
    body: JSON.stringify({
      actionType: "set_urgent", targetType: "task", targetId: "task_approval_target",
      payload: { priority: "urgent" }, reason: "Deadline became critical",
    }),
  });
  const createdBody = await created.json() as any;
  assert.equal(created.status, 201);
  assert.equal(createdBody.data.target.title, "Approval target");
  const approvalId = createdBody.data.id;

  const approved = await apiFetch(`/approvals/${approvalId}/approve`, "full-interactive-token", {
    method: "POST", body: JSON.stringify({ note: "Proceed after review" }),
  });
  const approvedBody = await approved.json() as any;
  assert.equal(approvedBody.data.status, "approved");
  assert.equal(approvedBody.data.resolutionNote, "Proceed after review");

  const resolvedList = await apiFetch("/approvals?status=approved", "full-interactive-token");
  const resolvedBody = await resolvedList.json() as any;
  assert.equal(resolvedBody.data[0].target.title, "Approval target");
  assert.deepEqual(resolvedBody.data[0].payload, { priority: "urgent" });

  const duplicate = await apiFetch(`/approvals/${approvalId}/approve`, "full-interactive-token", { method: "POST", body: "{}" });
  assert.equal(duplicate.status, 400);
  const notification = db.prepare("SELECT * FROM notifications WHERE dedupeKey = ?").get(`approval_requested:${approvalId}`) as any;
  assert.equal(notification.severity, "attention");
});

test("notifications list and read state are persistent", async () => {
  const unread = await apiFetch("/notifications?unread=true", "full-interactive-token");
  const unreadBody = await unread.json() as any;
  assert.ok(unreadBody.data.length >= 2);
  const id = unreadBody.data[0].id;

  const marked = await apiFetch(`/notifications/${id}/read`, "full-interactive-token", { method: "POST", body: "{}" });
  const markedBody = await marked.json() as any;
  assert.ok(markedBody.data.readAt);

  const all = await apiFetch("/notifications/read-all", "full-interactive-token", { method: "POST", body: "{}" });
  assert.equal(all.status, 200);
  const remaining = db.prepare("SELECT COUNT(*) count FROM notifications WHERE readAt IS NULL").get() as any;
  assert.equal(remaining.count, 0);
});

test("browser notification preference is explicitly patchable", async () => {
  const saved = await apiFetch("/settings", "full-interactive-token", {
    method: "PATCH", body: JSON.stringify({ browserNotificationsEnabled: "true" }),
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json() as any;
  assert.equal(savedBody.data.browserNotificationsEnabled, "true");

  const forbidden = await apiFetch("/settings", "gordon-interactive-token", {
    method: "PATCH", body: JSON.stringify({ browserNotificationsEnabled: "false" }),
  });
  assert.equal(forbidden.status, 403);
});
