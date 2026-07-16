import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

const tempDir = mkdtempSync(join(tmpdir(), "solomon-openclaw-test-"));
process.env.DATABASE_PATH = join(tempDir, "test.db");
process.env.LOCAL_API_TOKEN = "full-test-token";
process.env.GORDON_API_TOKEN = "gordon-test-token";
process.env.OPENCLAW_WEBHOOK_ENABLED = "true";
process.env.OPENCLAW_HOOK_TOKEN = "hook-test-token";

let webhookStatus = 200;
const deliveries: Array<{ authorization?: string; body: any }> = [];
const webhookServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    deliveries.push({
      authorization: req.headers.authorization,
      body: JSON.parse(body),
    });
    res.writeHead(webhookStatus, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: webhookStatus >= 200 && webhookStatus < 300 }));
  });
});

await new Promise<void>((resolve) => webhookServer.listen(0, "127.0.0.1", resolve));
const address = webhookServer.address();
if (!address || typeof address === "string") throw new Error("Webhook test server did not start");
process.env.OPENCLAW_SOLOMON_WEBHOOK_URL = `http://127.0.0.1:${address.port}/solomon`;

const { db } = await import("../src/db.js");
const { authMiddleware } = await import("../src/helpers.js");
const { agentRouter } = await import("../src/routes/agent.js");
const { agentActionsRouter, settingsRouter } = await import("../src/routes/misc.js");
const { publishDomainEvent } = await import("../src/events.js");
const {
  openClawStatus, processOpenClawQueue, queueOpenClawEvent,
} = await import("../src/openclaw.js");

const app = express();
app.use(express.json());
const api = express.Router();
api.use(authMiddleware);
api.use("/agent/actions", agentActionsRouter);
api.use("/agent", agentRouter);
api.use("/settings", settingsRouter);
app.use("/api/v1", api);
const apiServer = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => apiServer.once("listening", resolve));
const apiAddress = apiServer.address();
if (!apiAddress || typeof apiAddress === "string") throw new Error("API test server did not start");
const apiBase = `http://127.0.0.1:${apiAddress.port}/api/v1`;

async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  return fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Agent-Name": "Imposter",
      ...(options.headers || {}),
    },
  });
}

after(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
  await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("Gordon token is scoped and binds agent identity", async () => {
  const context = await apiFetch("/agent/context/today", "gordon-test-token");
  assert.equal(context.status, 200);

  const forbidden = await apiFetch("/settings", "gordon-test-token");
  assert.equal(forbidden.status, 403);

  const actionResponse = await apiFetch("/agent/actions/log", "gordon-test-token", {
    method: "POST",
    body: JSON.stringify({ actionType: "reminder", targetType: "task", targetId: "task_missing", summary: "Reminder sent" }),
  });
  assert.equal(actionResponse.status, 201);
  const actionBody = await actionResponse.json() as any;
  assert.equal(actionBody.data.agentName, "Gordon");

  const rawActionResponse = await apiFetch("/agent/actions", "gordon-test-token", {
    method: "POST",
    body: JSON.stringify({ agentName: "Imposter", summary: "Raw action route" }),
  });
  const rawActionBody = await rawActionResponse.json() as any;
  assert.equal(rawActionBody.data.agentName, "Gordon");

  const fullAccess = await apiFetch("/settings", "full-test-token");
  assert.equal(fullAccess.status, 200);
});

test("verified completion requires evidence or approval", async () => {
  const createResponse = await apiFetch("/agent/tasks/create", "gordon-test-token", {
    method: "POST",
    body: JSON.stringify({ title: "Verify Gordon completion", agentCandidate: true, reason: "Integration test" }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as any;
  const taskId = created.data.task.id;

  const approvalResponse = await apiFetch("/agent/approvals", "gordon-test-token", {
    method: "POST",
    body: JSON.stringify({
      actionType: "mark_complete",
      targetType: "task",
      targetId: taskId,
      payload: { status: "done" },
      reason: "User verification required",
    }),
  });
  assert.equal(approvalResponse.status, 201);
  const approvalBody = await approvalResponse.json() as any;
  assert.equal(approvalBody.data.agentName, "Gordon");
  const approvalDetail = await apiFetch(`/agent/approvals/${approvalBody.data.id}`, "gordon-test-token");
  assert.equal(approvalDetail.status, 200);
  const pending = await apiFetch("/agent/approvals/pending", "gordon-test-token");
  const pendingBody = await pending.json() as any;
  assert.ok(pendingBody.data.some((approval: any) => approval.id === approvalBody.data.id));

  const denied = await apiFetch(`/agent/tasks/${taskId}/update-status`, "gordon-test-token", {
    method: "POST",
    body: JSON.stringify({ status: "done", reason: "No proof" }),
  });
  assert.equal(denied.status, 403);

  const completed = await apiFetch(`/agent/tasks/${taskId}/update-status`, "gordon-test-token", {
    method: "POST",
    body: JSON.stringify({
      status: "done",
      reason: "Work executed and checked",
      completedByAgent: true,
      evidence: "Observed the expected test result",
    }),
  });
  assert.equal(completed.status, 200);

  const reminder = await apiFetch("/agent/actions/log", "gordon-test-token", {
    method: "POST",
    body: JSON.stringify({
      actionType: "reminder", targetType: "task", targetId: taskId,
      summary: "Owner notified of completion",
    }),
  });
  assert.equal(reminder.status, 201);

  const detail = await apiFetch(`/agent/tasks/${taskId}`, "gordon-test-token");
  const detailBody = await detail.json() as any;
  assert.equal(detailBody.data.status, "done");
  assert.ok(detailBody.data.lastRemindedAt);
  assert.ok(detailBody.data.notes.some((note: any) => note.body.includes("Completion evidence")));
  const completionNotification = db.prepare(
    "SELECT * FROM notifications WHERE type = 'agent_task_completed' AND targetId = ?"
  ).get(taskId) as any;
  assert.equal(completionNotification.actor, "Gordon");
});

test("domain events deliver redacted metadata and skip Gordon-originated loops", async () => {
  db.prepare(
    `INSERT INTO tasks (id, title, description, area, parentTaskId, source, status, priority, dueDate, tags, agentCandidate, createdAt, updatedAt, completedAt, archivedAt)
     VALUES ('task_sensitive', 'Private title', 'private body', NULL, NULL, 'user', 'todo', 'high', NULL, '[]', 0, ?, ?, NULL, NULL)`
  ).run(new Date().toISOString(), new Date().toISOString());

  publishDomainEvent("data-changed", { entity: "task", id: "task_sensitive", op: "update" });
  publishDomainEvent("data-changed", { entity: "task", id: "task_sensitive", op: "status", by: "agent" });
  await processOpenClawQueue();

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].authorization, "Bearer hook-test-token");
  assert.equal(deliveries[0].body.entityId, "task_sensitive");
  const serialized = JSON.stringify(deliveries[0].body);
  assert.equal(serialized.includes("Private title"), false);
  assert.equal(serialized.includes("private body"), false);
  assert.equal(serialized.includes("hook-test-token"), false);
  assert.equal(openClawStatus().queue.delivered, 1);
});

test("transient failures retry and terminal client failures are visible", async () => {
  webhookStatus = 500;
  const retryId = queueOpenClawEvent({
    eventType: "integration.retry",
    entityType: "integration",
    dedupeKey: `retry:${Date.now()}`,
  });
  assert.ok(retryId);
  await processOpenClawQueue();
  let retryRow = db.prepare("SELECT status, attempts, lastError FROM webhook_outbox WHERE id = ?").get(retryId) as any;
  assert.equal(retryRow.status, "queued");
  assert.equal(retryRow.attempts, 1);
  assert.equal(retryRow.lastError, "HTTP 500");

  webhookStatus = 200;
  db.prepare("UPDATE webhook_outbox SET nextAttemptAt = ? WHERE id = ?").run(new Date(0).toISOString(), retryId);
  await processOpenClawQueue();
  retryRow = db.prepare("SELECT status, attempts FROM webhook_outbox WHERE id = ?").get(retryId) as any;
  assert.equal(retryRow.status, "delivered");
  assert.equal(retryRow.attempts, 2);

  webhookStatus = 401;
  const failedId = queueOpenClawEvent({
    eventType: "integration.client-error",
    entityType: "integration",
    dedupeKey: `client-error:${Date.now()}`,
  });
  await processOpenClawQueue();
  const failed = db.prepare("SELECT status, attempts, lastError FROM webhook_outbox WHERE id = ?").get(failedId) as any;
  assert.equal(failed.status, "failed");
  assert.equal(failed.attempts, 1);
  assert.equal(failed.lastError, "HTTP 401");
  assert.ok(openClawStatus().queue.failed >= 1);
  const failureNotification = db.prepare(
    "SELECT * FROM notifications WHERE type = 'integration_failed' AND targetId = ?"
  ).get(failedId) as any;
  assert.equal(failureNotification.severity, "error");
});
