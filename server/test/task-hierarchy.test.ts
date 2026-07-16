import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import express from "express";

const testDir = mkdtempSync(join(tmpdir(), "key-of-solomon-task-test-"));
const databasePath = join(testDir, "legacy.db");

// Start with the Beta 2 task shape to prove startup migration is backward-compatible.
const legacy = new Database(databasePath);
legacy.exec(`
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    area TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT,
    dueDate TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    agentCandidate INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    completedAt TEXT,
    archivedAt TEXT
  )
`);
legacy.close();

process.env.DATABASE_PATH = databasePath;
const { db, setSetting } = await import("../src/db.js");
const { insertTask, patchTask, taskWithHierarchy } = await import("../src/routes/tasks.js");
const { parseCaptureClassification } = await import("../src/ai.js");
const { captureRouter, settingsRouter } = await import("../src/routes/misc.js");
const { agentRouter } = await import("../src/routes/agent.js");

test("adds parentTaskId to an existing database", () => {
  const columns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  assert.equal(columns.some((column) => column.name === "parentTaskId"), true);
  assert.equal(columns.some((column) => column.name === "source"), true);
});

test("creates one-level subtasks and derives progress", () => {
  const parent = insertTask({ title: "Schedule appointment", area: "health" });
  const first = insertTask({ title: "Find provider", parentTaskId: parent.id });
  const second = insertTask({ title: "Book appointment", parentTaskId: parent.id });

  assert.equal(first.parentTaskId, parent.id);
  assert.throws(
    () => insertTask({ title: "Nested step", parentTaskId: first.id }),
    /Only one task\/subtask level is supported/
  );

  patchTask(first.id, { status: "done" });
  const progress = taskWithHierarchy(parent.id);
  assert.equal(progress.subtaskCount, 2);
  assert.equal(progress.completedSubtaskCount, 1);

  assert.throws(
    () => patchTask(parent.id, { status: "done" }),
    /Complete the remaining 1 subtask first/
  );

  patchTask(second.id, { status: "done" });
  assert.equal(patchTask(parent.id, { status: "done" }).status, "done");
});

test("prevents active children under a completed parent", () => {
  const parent = insertTask({ title: "Completed outcome", status: "done" });
  assert.throws(
    () => insertTask({ title: "Late follow-up", parentTaskId: parent.id }),
    /Reopen the parent task/
  );
});

test("normalizes and limits AI-generated subtasks", () => {
  const result = parseCaptureClassification(JSON.stringify({
    type: "task",
    title: "Schedule appointment",
    area: "health",
    confidence: 0.96,
    subtasks: [
      "Find provider",
      "Find provider",
      "Confirm insurance",
      "Book appointment",
      "Prepare paperwork",
      "Confirm transportation",
      "Add calendar reminder",
      "Schedule appointment",
    ],
  }), "Raw capture");

  assert.deepEqual(result.subtasks, [
    "Find provider",
    "Confirm insurance",
    "Book appointment",
    "Prepare paperwork",
    "Confirm transportation",
    "Add calendar reminder",
  ]);
});

test("Fast Capture creates one main task with linked AI-generated subtasks", async () => {
  const aiServer = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({
      message: {
        content: JSON.stringify({
          type: "task",
          title: "Schedule specialist appointment",
          area: "health",
          confidence: 0.97,
          subtasks: ["Find specialist", "Book appointment"],
        }),
      },
    }));
  });
  await new Promise<void>((resolve) => aiServer.listen(0, "127.0.0.1", resolve));
  const aiAddress = aiServer.address();
  if (!aiAddress || typeof aiAddress === "string") throw new Error("AI mock server did not start");

  setSetting("aiProvider", "ollama");
  setSetting("aiBaseUrl", `http://127.0.0.1:${aiAddress.port}`);

  const app = express();
  app.use(express.json());
  app.use("/capture", captureRouter);
  const apiServer = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => apiServer.once("listening", resolve));
  const apiAddress = apiServer.address();
  if (!apiAddress || typeof apiAddress === "string") throw new Error("Capture test server did not start");

  try {
    const response = await fetch(`http://127.0.0.1:${apiAddress.port}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "I need to find and schedule a specialist appointment" }),
    });
    const body = await response.json() as any;

    assert.equal(response.status, 201);
    assert.equal(body.data.created.title, "Schedule specialist appointment");
    assert.equal(body.data.subtasks.length, 2);
    assert.equal(body.data.subtasks[0].parentTaskId, body.data.created.id);
    assert.equal(body.data.created.source, "fast_capture");
    assert.equal(body.data.subtasks[0].source, "embedded_ai");
    assert.equal(taskWithHierarchy(body.data.created.id).subtaskCount, 2);
    assert.equal(taskWithHierarchy(body.data.created.id).subtaskPlanSource, "embedded_ai");

    setSetting("captureAutoBreakdown", "false");
    const noBreakdownResponse = await fetch(`http://127.0.0.1:${apiAddress.port}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Schedule another specialist appointment" }),
    });
    const noBreakdownBody = await noBreakdownResponse.json() as any;
    assert.equal(noBreakdownBody.data.created.source, "fast_capture");
    assert.equal(noBreakdownBody.data.subtasks.length, 0);
  } finally {
    setSetting("aiProvider", "none");
    setSetting("aiBaseUrl", "");
    setSetting("captureAutoBreakdown", "true");
    await Promise.all([
      new Promise<void>((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => aiServer.close((error) => error ? reject(error) : resolve())),
    ]);
  }
});

test("agent ownership rules prevent duplicate work and unplanned re-decomposition", async () => {
  const app = express();
  app.use(express.json());
  app.use("/agent", agentRouter);
  app.use("/settings", settingsRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Boundary test server did not start");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-Name": "Gordon-Test" },
    body: JSON.stringify(body),
  });

  try {
    const parentResponse = await post("/agent/tasks/create", {
      title: "Ownership boundary parent",
      reason: "Track one outcome",
    });
    const parentBody = await parentResponse.json() as any;
    assert.equal(parentResponse.status, 201);
    assert.equal(parentBody.data.task.source, "agent");
    const parentId = parentBody.data.task.id;

    const duplicateResponse = await post("/agent/tasks/create", {
      title: "  OWNERSHIP   BOUNDARY PARENT ",
      reason: "Accidental duplicate",
    });
    const duplicateBody = await duplicateResponse.json() as any;
    assert.equal(duplicateResponse.status, 409);
    assert.equal(duplicateBody.error.code, "DUPLICATE_TASK");

    const planResponse = await post(`/agent/tasks/${parentId}/create-subtasks`, {
      subtasks: ["First owned step", "Second owned step"],
      reason: "Create the initial execution plan",
    });
    const planBody = await planResponse.json() as any;
    assert.equal(planResponse.status, 201);
    assert.equal(planBody.data.subtasks.length, 2);
    assert.equal(planBody.data.parent.subtaskPlanSource, "agent");

    const embeddedParent = insertTask({ title: "Embedded-owned intake", source: "fast_capture" });
    insertTask({ title: "Embedded-owned first step", parentTaskId: embeddedParent.id, source: "embedded_ai" });
    const embeddedOverlapResponse = await post(`/agent/tasks/${embeddedParent.id}/create-subtasks`, {
      subtasks: ["Agent-generated overlapping step"],
      reason: "Attempt to decompose work already structured by embedded AI",
    });
    const embeddedOverlapBody = await embeddedOverlapResponse.json() as any;
    assert.equal(embeddedOverlapResponse.status, 409);
    assert.equal(embeddedOverlapBody.error.code, "SUBTASK_PLAN_EXISTS");

    const secondPlanResponse = await post(`/agent/tasks/${parentId}/create-subtasks`, {
      subtasks: ["Third owned step"],
      reason: "Attempt an overlapping plan",
    });
    const secondPlanBody = await secondPlanResponse.json() as any;
    assert.equal(secondPlanResponse.status, 409);
    assert.equal(secondPlanBody.error.code, "SUBTASK_PLAN_EXISTS");

    const extensionResponse = await post(`/agent/tasks/${parentId}/create-subtasks`, {
      subtasks: ["Third owned step"],
      extendExistingPlan: true,
      reason: "A newly discovered required step",
    });
    const extensionBody = await extensionResponse.json() as any;
    assert.equal(extensionResponse.status, 201);
    assert.equal(extensionBody.data.parent.subtaskCount, 3);

    const settingsResponse = await fetch(`${base}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiProvider: "ollama",
        aiModel: "llama3.2",
        aiBaseUrl: "http://localhost:11434",
        captureAutoClassify: "true",
        captureAutoBreakdown: "false",
      }),
    });
    const settingsBody = await settingsResponse.json() as any;
    assert.equal(settingsResponse.status, 200);
    assert.equal(settingsBody.data.aiProvider, "ollama");
    assert.equal(settingsBody.data.captureAutoBreakdown, "false");
  } finally {
    setSetting("aiProvider", "none");
    setSetting("aiModel", "");
    setSetting("aiBaseUrl", "");
    setSetting("captureAutoBreakdown", "true");
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
