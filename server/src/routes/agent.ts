/**
 * agent.ts — agent-safe API under /api/v1/agent
 *
 * Every endpoint here:
 *  - validates input
 *  - logs the action to agent_actions
 *  - never hard-deletes anything
 *  - adds notes instead of overwriting user content
 */
import { Router } from "express";
import { db } from "../db.js";
import {
  ok, fail, now, parseRows, requireString, oneOf,
  ValidationError, TASK_STATUSES, ACTION_TYPES,
} from "../helpers.js";
import {
  attachmentsFor, createNote, getEntity, logAgentAction, notesFor,
} from "../store.js";
import {
  findOpenTaskDuplicate, insertTask, normalizeTaskTitle,
  patchTask, taskWithHierarchy,
} from "./tasks.js";
import { insertIdea, convertIdea } from "./ideas.js";
import { buildDashboardState } from "./dashboard.js";
import { broadcast } from "../events.js";
import {
  createApprovalRequest, getApproval, getPendingApprovals,
} from "./misc.js";
import { createNotification } from "../notifications.js";

export const agentRouter = Router();

function agentName(req: any): string {
  if (req.authScope === "gordon") return "Gordon";
  return (
    (typeof req.headers["x-agent-name"] === "string" && req.headers["x-agent-name"]) ||
    (typeof req.body?.agentName === "string" && req.body.agentName) ||
    "agent"
  );
}

function taskContextSql(where: string) {
  return `SELECT t.*, p.title AS parentTaskTitle,
    (SELECT COUNT(*) FROM tasks c WHERE c.parentTaskId = t.id AND c.status != 'archived') AS subtaskCount,
    (SELECT COUNT(*) FROM tasks c WHERE c.parentTaskId = t.id AND c.status = 'done') AS completedSubtaskCount,
    (SELECT CASE WHEN COUNT(*) = 0 THEN NULL WHEN MIN(c.source) = MAX(c.source) THEN MIN(c.source) ELSE 'mixed' END
       FROM tasks c WHERE c.parentTaskId = t.id AND c.status != 'archived') AS subtaskPlanSource,
    (SELECT MAX(a.createdAt) FROM agent_actions a
       WHERE a.actionType = 'reminder' AND a.targetType = 'task' AND a.targetId = t.id) AS lastRemindedAt
    FROM tasks t LEFT JOIN tasks p ON p.id = t.parentTaskId WHERE ${where}`;
}

function approvedFor(id: unknown, actions: string[], targetType: string, targetId: string) {
  if (typeof id !== "string" || !id) return false;
  const approval = getApproval(id);
  return approval?.status === "approved" && actions.includes(approval.actionType)
    && approval.targetType === targetType && approval.targetId === targetId;
}

function conflict(res: any, code: string, message: string, data: unknown) {
  return res.status(409).json({ success: false, data, error: { code, message } });
}

/* ---------- read context ---------- */

agentRouter.get("/context/today", (req, res) => {
  const all = (where: string, order = "t.updatedAt DESC", ...params: any[]) => parseRows(
    db.prepare(`${taskContextSql(where)} ORDER BY ${order}`).all(...params)
  );
  const nowIso = now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const data = {
    generatedAt: nowIso,
    dueToday: all(
      "t.status NOT IN ('done','archived') AND t.dueDate IS NOT NULL AND t.dueDate <= ? AND t.dueDate >= ?",
      "t.dueDate ASC", endOfToday.toISOString(), nowIso.slice(0, 10)
    ),
    overdue: all(
      "t.status NOT IN ('done','archived') AND t.dueDate IS NOT NULL AND t.dueDate < ?",
      "t.dueDate ASC", nowIso
    ),
    urgent: all("t.priority = 'urgent' AND t.status NOT IN ('done','archived')"),
    blocked: all("t.status = 'blocked'"),
    waiting: all("t.status = 'waiting'"),
    stale: all(
      "t.status NOT IN ('done','archived') AND t.updatedAt < ?",
      "t.updatedAt ASC", new Date(Date.now() - 14 * 86400_000).toISOString()
    ),
    inProgress: all("t.status = 'in_progress'"),
    agentCandidates: all("t.agentCandidate = 1 AND t.status IN ('todo','in_progress','waiting')"),
    activeProjects: parseRows(db.prepare("SELECT * FROM projects WHERE status = 'active'").all()),
    recentNotes: parseRows(db.prepare("SELECT * FROM notes ORDER BY createdAt DESC LIMIT 10").all()),
    pendingApprovals: getPendingApprovals(),
  };
  ok(res, data);
});

agentRouter.get("/context/dashboard", (req, res) => {
  logAgentAction({
    agentName: agentName(req),
    actionType: "dashboard_request",
    summary: "Requested dashboard context",
  });
  ok(res, buildDashboardState());
});

/* ---------- tasks ---------- */

agentRouter.get("/tasks/available", (_req, res) => {
  const rows = parseRows(
    db.prepare(
      `SELECT t.*, p.title AS parentTaskTitle,
         (SELECT COUNT(*) FROM tasks c WHERE c.parentTaskId = t.id AND c.status != 'archived') AS subtaskCount,
         (SELECT COUNT(*) FROM tasks c WHERE c.parentTaskId = t.id AND c.status = 'done') AS completedSubtaskCount,
         (SELECT CASE WHEN COUNT(*) = 0 THEN NULL WHEN MIN(c.source) = MAX(c.source) THEN MIN(c.source) ELSE 'mixed' END
            FROM tasks c WHERE c.parentTaskId = t.id AND c.status != 'archived') AS subtaskPlanSource
       FROM tasks t
       LEFT JOIN tasks p ON p.id = t.parentTaskId
       WHERE t.status IN ('todo','in_progress','waiting')
       ORDER BY t.agentCandidate DESC,
         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.updatedAt DESC
       LIMIT 50`
    ).all()
  );
  ok(res, rows);
});

agentRouter.get("/tasks/:id", (req, res) => {
  const task = taskWithHierarchy(req.params.id);
  if (!task) return fail(res, 404, "NOT_FOUND", "Task not found");
  const reminder = db.prepare(
    "SELECT MAX(createdAt) AS lastRemindedAt FROM agent_actions WHERE actionType = 'reminder' AND targetType = 'task' AND targetId = ?"
  ).get(req.params.id) as any;
  ok(res, {
    ...task,
    lastRemindedAt: reminder?.lastRemindedAt ?? null,
    notes: notesFor("task", req.params.id),
    attachments: attachmentsFor("task", req.params.id),
  });
});

agentRouter.get("/projects/:id", (req, res) => {
  const project = getEntity("project", req.params.id);
  if (!project) return fail(res, 404, "NOT_FOUND", "Project not found");
  ok(res, {
    ...project,
    notes: notesFor("project", req.params.id),
    attachments: attachmentsFor("project", req.params.id),
  });
});

agentRouter.get("/ideas/:id", (req, res) => {
  const idea = getEntity("idea", req.params.id);
  if (!idea) return fail(res, 404, "NOT_FOUND", "Idea not found");
  ok(res, {
    ...idea,
    notes: notesFor("idea", req.params.id),
    attachments: attachmentsFor("idea", req.params.id),
  });
});

agentRouter.post("/tasks/create", (req, res) => {
  try {
    const body = req.body || {};
    const title = requireString(body, "title");
    if (!title) return fail(res, 400, "VALIDATION_ERROR", "Title is required");
    if (body.extendExistingPlan === true && !requireString(body, "reason")) {
      return fail(res, 400, "VALIDATION_ERROR", "A reason is required when extending an existing subtask plan");
    }
    const parentTaskId = typeof body.parentTaskId === "string" ? body.parentTaskId.trim() : null;
    const duplicate = findOpenTaskDuplicate(title, parentTaskId);
    if (duplicate) {
      return conflict(res, "DUPLICATE_TASK", `An open task with this title already exists: ${duplicate.id}`, { existingTask: duplicate });
    }
    if (parentTaskId) {
      const existingPlan = parseRows(db.prepare(
        "SELECT * FROM tasks WHERE parentTaskId = ? AND status != 'archived' ORDER BY createdAt ASC"
      ).all(parentTaskId));
      if (existingPlan.length > 0 && body.extendExistingPlan !== true) {
        return conflict(
          res,
          "SUBTASK_PLAN_EXISTS",
          "This task already has a subtask plan. Work the existing plan or set extendExistingPlan to true with a reason.",
          { existingSubtasks: existingPlan }
        );
      }
    }
    const task = insertTask({ ...body, title, source: "agent" });
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: "create",
      targetType: "task",
      targetId: task.id,
      summary: task.parentTaskId
        ? `Created subtask '${task.title}' under ${task.parentTaskId}`
        : `Created task '${task.title}'`,
      details: req.body?.reason,
    });
    broadcast("data-changed", { entity: "task", id: task.id, op: "create", by: "agent" });
    ok(res, { task, action }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

agentRouter.post("/tasks/:id/create-subtasks", (req, res) => {
  try {
    const parent = getEntity("task", req.params.id);
    if (!parent) return fail(res, 404, "NOT_FOUND", "Task not found");
    if (parent.parentTaskId) return fail(res, 400, "VALIDATION_ERROR", "Subtasks cannot receive their own subtask plan");
    if (["done", "archived"].includes(parent.status))
      return fail(res, 400, "VALIDATION_ERROR", "Reopen the task before creating a subtask plan");

    const reason = requireString(req.body || {}, "reason");
    if (!reason) return fail(res, 400, "VALIDATION_ERROR", "reason is required");
    const requested = req.body?.subtasks;
    if (!Array.isArray(requested) || requested.length < 1 || requested.length > 8)
      return fail(res, 400, "VALIDATION_ERROR", "subtasks must contain 1-8 items");

    const specs = requested.map((item: any) => {
      const title = typeof item === "string" ? item.trim() : requireString(item || {}, "title");
      if (!title) throw new ValidationError("Every subtask needs a title");
      return typeof item === "string" ? { title } : { ...item, title };
    });
    const normalized = specs.map((item) => normalizeTaskTitle(item.title));
    if (new Set(normalized).size !== normalized.length)
      return fail(res, 400, "VALIDATION_ERROR", "The subtask plan contains duplicate titles");

    const existing = parseRows(db.prepare(
      "SELECT * FROM tasks WHERE parentTaskId = ? AND status != 'archived' ORDER BY createdAt ASC"
    ).all(parent.id));
    if (existing.length > 0 && req.body?.extendExistingPlan !== true) {
      return conflict(
        res,
        "SUBTASK_PLAN_EXISTS",
        "This task already has a subtask plan. Work the existing plan or explicitly extend it.",
        { existingSubtasks: existing }
      );
    }
    const existingTitles = new Map(existing.map((task) => [normalizeTaskTitle(task.title), task]));
    const duplicateSpec = specs.find((item) => existingTitles.has(normalizeTaskTitle(item.title)));
    if (duplicateSpec) {
      return conflict(
        res,
        "DUPLICATE_TASK",
        `Subtask '${duplicateSpec.title}' already exists`,
        { existingTask: existingTitles.get(normalizeTaskTitle(duplicateSpec.title)) }
      );
    }

    const subtasks = db.transaction(() => specs.map((item) => insertTask({
      ...item,
      parentTaskId: parent.id,
      area: item.area ?? parent.area,
      source: "agent",
    })))();
    const mode = existing.length > 0 ? "Extended" : "Created";
    createNote({
      parentType: "task",
      parentId: parent.id,
      body: `${mode} subtask plan with ${subtasks.length} item${subtasks.length === 1 ? "" : "s"}. Reason: ${reason}`,
      type: "agent_update",
      createdBy: "agent",
    });
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: "update",
      targetType: "task",
      targetId: parent.id,
      summary: `${mode} ${subtasks.length}-item subtask plan for '${parent.title}'`,
      details: reason,
    });
    broadcast("data-changed", { entity: "task", id: parent.id, op: "subtask_plan", by: "agent" });
    ok(res, { parent: taskWithHierarchy(parent.id), subtasks, action }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

agentRouter.post("/tasks/:id/update-status", (req, res) => {
  try {
    const task = getEntity("task", req.params.id);
    if (!task) return fail(res, 404, "NOT_FOUND", "Task not found");
    const status = oneOf(req.body?.status, TASK_STATUSES);
    if (!status) return fail(res, 400, "VALIDATION_ERROR", `status must be one of: ${TASK_STATUSES.join(", ")}`);
    const reason = requireString(req.body || {}, "reason");
    if (!reason)
      return fail(res, 400, "VALIDATION_ERROR", "Agents must provide a 'reason' when changing status");

    if (status === "done") {
      const selfCompleted = req.body?.completedByAgent === true && !!requireString(req.body || {}, "evidence");
      const approved = approvedFor(req.body?.approvalId, ["mark_complete", "mark_done"], "task", req.params.id);
      if (!selfCompleted && !approved) {
        return fail(
          res, 403, "APPROVAL_REQUIRED",
          "Completion requires completedByAgent=true with evidence, or an approved mark_complete approvalId."
        );
      }
    }
    if (status === "archived" && !approvedFor(req.body?.approvalId, ["archive"], "task", req.params.id)) {
      return fail(res, 403, "APPROVAL_REQUIRED", "Archiving requires an approved archive approvalId.");
    }

    const updated = patchTask(req.params.id, { status });
    createNote({
      parentType: "task", parentId: req.params.id,
      body: `Status changed ${task.status} → ${status}. Reason: ${reason}`,
      type: "agent_update", createdBy: "agent",
    });
    if (status === "done" && req.body?.completedByAgent === true) {
      const evidence = requireString(req.body || {}, "evidence") || "Verified by Gordon";
      createNote({
        parentType: "task", parentId: req.params.id,
        body: `Completion evidence: ${evidence}`,
        type: "progress", createdBy: "agent",
      });
      createNotification({
        type: "agent_task_completed", severity: "success",
        title: `Gordon completed: ${task.title}`,
        body: evidence,
        targetType: "task", targetId: req.params.id, actor: "Gordon",
        dedupeKey: `agent_task_completed:${req.params.id}:${updated.completedAt || updated.updatedAt}`,
      });
    }
    if (status === "blocked") {
      createNotification({
        type: "agent_task_blocked", severity: "attention",
        title: `Gordon blocked: ${task.title}`,
        body: reason,
        targetType: "task", targetId: req.params.id, actor: "Gordon",
        dedupeKey: `agent_task_blocked:${req.params.id}:${updated.updatedAt}`,
      });
    }
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: "status_change",
      targetType: "task",
      targetId: req.params.id,
      summary: `Task '${task.title}': ${task.status} → ${status}`,
      details: reason,
    });
    broadcast("data-changed", { entity: "task", id: req.params.id, op: "status", by: "agent" });
    ok(res, { task: updated, action });
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

agentRouter.post("/tasks/:id/set-parent", (req, res) => {
  try {
    const task = getEntity("task", req.params.id);
    if (!task) return fail(res, 404, "NOT_FOUND", "Task not found");
    const reason = requireString(req.body || {}, "reason");
    if (!reason)
      return fail(res, 400, "VALIDATION_ERROR", "Agents must provide a 'reason' when changing task hierarchy");
    const parentTaskId = req.body?.parentTaskId === null ? null : requireString(req.body || {}, "parentTaskId");
    if (req.body?.parentTaskId !== null && !parentTaskId)
      return fail(res, 400, "VALIDATION_ERROR", "parentTaskId must be a task ID or null");

    const updated = patchTask(req.params.id, { parentTaskId });
    createNote({
      parentType: "task",
      parentId: req.params.id,
      body: parentTaskId
        ? `Linked as a subtask of ${parentTaskId}. Reason: ${reason}`
        : `Detached from parent task. Reason: ${reason}`,
      type: "agent_update",
      createdBy: "agent",
    });
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: "update",
      targetType: "task",
      targetId: req.params.id,
      summary: parentTaskId
        ? `Linked task '${task.title}' under ${parentTaskId}`
        : `Detached task '${task.title}' from its parent`,
      details: reason,
    });
    broadcast("data-changed", { entity: "task", id: req.params.id, op: "hierarchy", by: "agent" });
    ok(res, { task: updated, action });
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

function addNoteEndpoint(parentType: "task" | "project" | "idea") {
  return (req: any, res: any) => {
    const parent = getEntity(parentType, req.params.id);
    if (!parent) return fail(res, 404, "NOT_FOUND", `${parentType} not found`);
    const body = requireString(req.body || {}, "body");
    if (!body) return fail(res, 400, "VALIDATION_ERROR", "Note body is required");
    const noteType = ["note", "progress", "decision", "blocker", "agent_update"].includes(req.body?.type)
      ? req.body.type
      : "agent_update";
    const note = createNote({ parentType, parentId: req.params.id, body, type: noteType, createdBy: "agent" });
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: "add_note",
      targetType: parentType,
      targetId: req.params.id,
      summary: `Added ${noteType} note to ${parentType} '${parent.title}'`,
    });
    broadcast("data-changed", { entity: "note", id: note.id, op: "create", by: "agent" });
    ok(res, { note, action }, 201);
  };
}

agentRouter.post("/tasks/:id/add-note", addNoteEndpoint("task"));
agentRouter.post("/projects/:id/add-note", addNoteEndpoint("project"));
agentRouter.post("/ideas/:id/add-note", addNoteEndpoint("idea"));

/* ---------- ideas ---------- */

agentRouter.post("/ideas/create", (req, res) => {
  try {
    const idea = insertIdea(req.body || {});
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: "create",
      targetType: "idea",
      targetId: idea.id,
      summary: `Captured idea '${idea.title}'`,
      details: req.body?.reason,
    });
    broadcast("data-changed", { entity: "idea", id: idea.id, op: "create", by: "agent" });
    ok(res, { idea, action }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

agentRouter.post("/ideas/:id/convert-to-task", (req, res) => {
  try {
    const reason = requireString(req.body || {}, "reason");
    if (!reason)
      return fail(res, 400, "VALIDATION_ERROR", "Agents must provide a 'reason' when converting an idea");
    const result = convertIdea(req.params.id, "task", req.body || {}, "agent");
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: "convert_idea",
      targetType: "idea",
      targetId: req.params.id,
      summary: `Converted idea '${result.idea.title}' to task ${result.converted.id}`,
      details: reason,
    });
    broadcast("data-changed", { entity: "idea", id: req.params.id, op: "convert", by: "agent" });
    ok(res, { task: result.converted, idea: result.idea, action }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

agentRouter.post("/ideas/:id/convert-to-project", (req, res) => {
  try {
    const reason = requireString(req.body || {}, "reason");
    if (!reason)
      return fail(res, 400, "VALIDATION_ERROR", "Agents must provide a 'reason' when converting an idea");
    if (!approvedFor(req.body?.approvalId, ["convert_idea_to_project"], "idea", req.params.id)) {
      return fail(res, 403, "APPROVAL_REQUIRED", "Conversion requires an approved convert_idea_to_project approvalId.");
    }
    const result = convertIdea(req.params.id, "project", req.body || {}, "agent");
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: "convert_idea",
      targetType: "idea",
      targetId: req.params.id,
      summary: `Converted idea '${result.idea.title}' to project ${result.converted.id}`,
      details: reason,
    });
    broadcast("data-changed", { entity: "idea", id: req.params.id, op: "convert", by: "agent" });
    ok(res, { project: result.converted, idea: result.idea, action }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

/* ---------- approval workflow ---------- */

agentRouter.get("/approvals/pending", (_req, res) => {
  ok(res, getPendingApprovals());
});

agentRouter.get("/approvals/:id", (req, res) => {
  const approval = getApproval(req.params.id);
  if (!approval) return fail(res, 404, "NOT_FOUND", "Approval not found");
  ok(res, approval);
});

agentRouter.post("/approvals", (req, res) => {
  try {
    const approval = createApprovalRequest(
      { ...(req.body || {}), agentName: agentName(req) },
      agentName(req),
    );
    broadcast("approval_requested", { id: approval.id, approval });
    broadcast("data-changed", { entity: "approval", id: approval.id, op: "create", by: "agent" });
    ok(res, approval, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

/* ---------- explicit action logging ---------- */

agentRouter.post("/actions/log", (req, res) => {
  try {
    const b = req.body || {};
    const summary = requireString(b, "summary");
    if (!summary) return fail(res, 400, "VALIDATION_ERROR", "summary is required");
    const action = logAgentAction({
      agentName: agentName(req),
      actionType: oneOf(b.actionType, ACTION_TYPES) ?? "update",
      targetType: b.targetType,
      targetId: b.targetId,
      summary,
      details: b.details,
    });
    broadcast("data-changed", { entity: "agent_action", id: action.id, op: "create" });
    ok(res, action, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});
