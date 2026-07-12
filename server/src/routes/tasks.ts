import { Router } from "express";
import { db } from "../db.js";
import {
  ok, fail, makeId, now, parseRow, parseRows, requireString, oneOf, tagsOf,
  ValidationError, TASK_STATUSES, TASK_SOURCES, PRIORITIES, NOTE_TYPES,
} from "../helpers.js";
import { archiveEntity, attachmentsFor, createAttachment, createNote, getEntity, notesFor } from "../store.js";
import { broadcast } from "../events.js";

export const tasksRouter = Router();

const TASK_SELECT = `
  SELECT t.*, p.title AS parentTaskTitle,
    (SELECT COUNT(*) FROM tasks c WHERE c.parentTaskId = t.id AND c.status != 'archived') AS subtaskCount,
    (SELECT COUNT(*) FROM tasks c WHERE c.parentTaskId = t.id AND c.status = 'done') AS completedSubtaskCount,
    (SELECT CASE WHEN COUNT(*) = 0 THEN NULL WHEN MIN(c.source) = MAX(c.source) THEN MIN(c.source) ELSE 'mixed' END
       FROM tasks c WHERE c.parentTaskId = t.id AND c.status != 'archived') AS subtaskPlanSource
  FROM tasks t
  LEFT JOIN tasks p ON p.id = t.parentTaskId
`;

export function taskWithHierarchy(id: string) {
  return parseRow(db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as any);
}

export function normalizeTaskTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function findOpenTaskDuplicate(title: string, parentTaskId: string | null = null) {
  const candidates = parseRows(db.prepare(
    `${TASK_SELECT}
     WHERE t.status NOT IN ('done','archived')
       AND ((? IS NULL AND t.parentTaskId IS NULL) OR t.parentTaskId = ?)`
  ).all(parentTaskId, parentTaskId));
  const normalized = normalizeTaskTitle(title);
  return candidates.find((task) => normalizeTaskTitle(task.title) === normalized);
}

function normalizeParentTaskId(value: unknown, taskId?: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError("parentTaskId must be a task ID or null");
  const parentTaskId = value.trim();
  if (!parentTaskId) return null;
  if (taskId && parentTaskId === taskId) throw new ValidationError("A task cannot be its own parent");

  const parent = getEntity("task", parentTaskId);
  if (!parent) throw new ValidationError("Parent task not found");
  if (parent.status === "archived") throw new ValidationError("Archived tasks cannot receive subtasks");
  if (parent.parentTaskId) throw new ValidationError("Only one task/subtask level is supported");
  return parentTaskId;
}

function assertHierarchyTransition(id: string, updates: Record<string, any>) {
  const current = getEntity("task", id);
  if (!current) throw new ValidationError("Task not found");

  const nextParentTaskId = updates.parentTaskId !== undefined
    ? updates.parentTaskId
    : current.parentTaskId ?? null;
  const nextStatus = updates.status ?? current.status;

  if (nextParentTaskId) {
    const childCount = (db.prepare(
      "SELECT COUNT(*) n FROM tasks WHERE parentTaskId = ? AND status != 'archived'"
    ).get(id) as { n: number }).n;
    if (childCount > 0) throw new ValidationError("A main task with subtasks cannot become a subtask");

    const parent = getEntity("task", nextParentTaskId);
    if (parent?.status === "done" && nextStatus !== "done" && nextStatus !== "archived") {
      throw new ValidationError("Reopen the parent task before adding or reopening an active subtask");
    }
  }

  if (nextStatus === "done") {
    const openChildren = (db.prepare(
      "SELECT COUNT(*) n FROM tasks WHERE parentTaskId = ? AND status NOT IN ('done','archived')"
    ).get(id) as { n: number }).n;
    if (openChildren > 0) {
      throw new ValidationError(`Complete the remaining ${openChildren} subtask${openChildren === 1 ? "" : "s"} first`);
    }
  }
}

tasksRouter.get("/", (req, res) => {
  const { status, area, priority, q, dueBefore, agentCandidate, includeArchived, parentTaskId, topLevel } =
    req.query as Record<string, string>;
  let sql = `${TASK_SELECT} WHERE 1=1`;
  const params: any[] = [];
  if (status) { sql += " AND t.status = ?"; params.push(status); }
  else if (includeArchived !== "true") { sql += " AND t.status != 'archived'"; }
  if (area) { sql += " AND t.area = ?"; params.push(area); }
  if (priority) { sql += " AND t.priority = ?"; params.push(priority); }
  if (dueBefore) { sql += " AND t.dueDate IS NOT NULL AND t.dueDate <= ?"; params.push(dueBefore); }
  if (agentCandidate === "true") { sql += " AND t.agentCandidate = 1"; }
  if (topLevel === "true") sql += " AND t.parentTaskId IS NULL";
  if (parentTaskId) { sql += " AND t.parentTaskId = ?"; params.push(parentTaskId); }
  if (q) {
    sql += " AND (t.title LIKE ? OR t.description LIKE ? OR t.tags LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " ORDER BY t.updatedAt DESC";
  ok(res, parseRows(db.prepare(sql).all(...params)));
});

tasksRouter.get("/:id", (req, res) => {
  const task = taskWithHierarchy(req.params.id);
  if (!task) return fail(res, 404, "NOT_FOUND", "Task not found");
  ok(res, {
    ...task,
    parentTask: task.parentTaskId ? taskWithHierarchy(task.parentTaskId) : null,
    subtasks: parseRows(db.prepare(
      `${TASK_SELECT} WHERE t.parentTaskId = ? AND t.status != 'archived' ORDER BY t.createdAt ASC`
    ).all(task.id)),
    notes: notesFor("task", task.id),
    attachments: attachmentsFor("task", task.id),
  });
});

export function insertTask(b: Record<string, any>): any {
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) throw new ValidationError("Title is required");
  const parentTaskId = normalizeParentTaskId(b.parentTaskId);
  const status = oneOf(b.status, TASK_STATUSES) ?? "todo";
  if (parentTaskId) {
    const parent = getEntity("task", parentTaskId);
    if (parent?.status === "done" && status !== "done" && status !== "archived") {
      throw new ValidationError("Reopen the parent task before adding an active subtask");
    }
  }
  const t = now();
  const task = {
    id: makeId("task"),
    title,
    description: b.description ?? null,
    area: b.area ?? null,
    parentTaskId,
    source: oneOf(b.source, TASK_SOURCES) ?? "user",
    status,
    priority: oneOf(b.priority, PRIORITIES) ?? null,
    dueDate: b.dueDate ?? null,
    tags: tagsOf(b.tags),
    agentCandidate: b.agentCandidate ? 1 : 0,
    createdAt: t,
    updatedAt: t,
    completedAt: status === "done" ? t : null,
    archivedAt: status === "archived" ? t : null,
  };
  db.prepare(
    `INSERT INTO tasks (id, title, description, area, parentTaskId, source, status, priority, dueDate, tags, agentCandidate, createdAt, updatedAt, completedAt, archivedAt)
     VALUES (@id, @title, @description, @area, @parentTaskId, @source, @status, @priority, @dueDate, @tags, @agentCandidate, @createdAt, @updatedAt, @completedAt, @archivedAt)`
  ).run(task);
  return taskWithHierarchy(task.id);
}

tasksRouter.post("/", (req, res) => {
  try {
    const task = insertTask({ ...(req.body || {}), source: "user" });
    broadcast("data-changed", { entity: "task", id: task.id, op: "create" });
    ok(res, task, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

export function patchTask(id: string, b: Record<string, any>): any {
  const updates: Record<string, any> = {};
  if (b.title !== undefined) {
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) throw new ValidationError("Title cannot be empty");
    updates.title = title;
  }
  for (const f of ["description", "area", "dueDate"]) {
    if (b[f] !== undefined) updates[f] = b[f] === "" ? null : b[f];
  }
  if (b.parentTaskId !== undefined) updates.parentTaskId = normalizeParentTaskId(b.parentTaskId, id);
  if (b.status !== undefined) {
    updates.status = oneOf(b.status, TASK_STATUSES);
    if (updates.status === "done") updates.completedAt = now();
    if (updates.status === "archived") updates.archivedAt = now();
    if (updates.status !== "archived") updates.archivedAt = null;
  }
  if (b.priority !== undefined) updates.priority = oneOf(b.priority, PRIORITIES) ?? null;
  if (b.tags !== undefined) updates.tags = tagsOf(b.tags);
  if (b.agentCandidate !== undefined) updates.agentCandidate = b.agentCandidate ? 1 : 0;
  if (Object.keys(updates).length === 0) throw new ValidationError("No valid fields to update");
  assertHierarchyTransition(id, updates);
  updates.updatedAt = now();
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = @id`).run({ ...updates, id });
  return taskWithHierarchy(id);
}

tasksRouter.patch("/:id", (req, res) => {
  try {
    if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
    const task = patchTask(req.params.id, req.body || {});
    broadcast("data-changed", { entity: "task", id: task.id, op: "update" });
    ok(res, task);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

// DELETE soft-archives in Beta 1
tasksRouter.delete("/:id", (req, res) => {
  if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
  const archived = archiveEntity("task", req.params.id);
  broadcast("data-changed", { entity: "task", id: req.params.id, op: "archive" });
  ok(res, { archived: true, task: archived });
});

tasksRouter.post("/:id/archive", (req, res) => {
  if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
  const archived = archiveEntity("task", req.params.id);
  broadcast("data-changed", { entity: "task", id: req.params.id, op: "archive" });
  ok(res, archived);
});

tasksRouter.post("/:id/complete", (req, res) => {
  try {
    if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
    const task = patchTask(req.params.id, { status: "done" });
    broadcast("data-changed", { entity: "task", id: req.params.id, op: "complete" });
    ok(res, task);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

tasksRouter.get("/:id/notes", (req, res) => {
  if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
  ok(res, notesFor("task", req.params.id));
});

tasksRouter.post("/:id/notes", (req, res) => {
  try {
    if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
    const body = requireString(req.body, "body");
    if (!body) return fail(res, 400, "VALIDATION_ERROR", "Note body is required");
    const note = createNote({
      parentType: "task",
      parentId: req.params.id,
      body,
      type: oneOf(req.body?.type, NOTE_TYPES) ?? "note",
      createdBy: req.body?.createdBy === "system" ? "system" : "user",
    });
    broadcast("data-changed", { entity: "note", id: note.id, op: "create" });
    ok(res, note, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

tasksRouter.get("/:id/attachments", (req, res) => {
  if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
  ok(res, attachmentsFor("task", req.params.id));
});

tasksRouter.post("/:id/attachments", (req, res) => {
  if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
  const b = req.body || {};
  if (!b.url && !b.filePath)
    return fail(res, 400, "VALIDATION_ERROR", "Attachment needs a url or filePath");
  const att = createAttachment({
    parentType: "task", parentId: req.params.id,
    label: b.label, url: b.url, filePath: b.filePath, type: b.type,
  });
  broadcast("data-changed", { entity: "attachment", id: att.id, op: "create" });
  ok(res, att, 201);
});
