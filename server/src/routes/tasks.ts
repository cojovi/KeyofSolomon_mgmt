import { Router } from "express";
import { db } from "../db.js";
import {
  ok, fail, makeId, now, parseRow, parseRows, requireString, oneOf, tagsOf,
  ValidationError, TASK_STATUSES, PRIORITIES, NOTE_TYPES,
} from "../helpers.js";
import { archiveEntity, attachmentsFor, createAttachment, createNote, getEntity, notesFor } from "../store.js";
import { broadcast } from "../events.js";

export const tasksRouter = Router();

tasksRouter.get("/", (req, res) => {
  const { status, area, priority, q, dueBefore, agentCandidate, includeArchived } =
    req.query as Record<string, string>;
  let sql = "SELECT * FROM tasks WHERE 1=1";
  const params: any[] = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  else if (includeArchived !== "true") { sql += " AND status != 'archived'"; }
  if (area) { sql += " AND area = ?"; params.push(area); }
  if (priority) { sql += " AND priority = ?"; params.push(priority); }
  if (dueBefore) { sql += " AND dueDate IS NOT NULL AND dueDate <= ?"; params.push(dueBefore); }
  if (agentCandidate === "true") { sql += " AND agentCandidate = 1"; }
  if (q) {
    sql += " AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " ORDER BY updatedAt DESC";
  ok(res, parseRows(db.prepare(sql).all(...params)));
});

tasksRouter.get("/:id", (req, res) => {
  const task = getEntity("task", req.params.id);
  if (!task) return fail(res, 404, "NOT_FOUND", "Task not found");
  ok(res, {
    ...task,
    notes: notesFor("task", task.id),
    attachments: attachmentsFor("task", task.id),
  });
});

export function insertTask(b: Record<string, any>): any {
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) throw new ValidationError("Title is required");
  const t = now();
  const task = {
    id: makeId("task"),
    title,
    description: b.description ?? null,
    area: b.area ?? null,
    status: oneOf(b.status, TASK_STATUSES) ?? "todo",
    priority: oneOf(b.priority, PRIORITIES) ?? null,
    dueDate: b.dueDate ?? null,
    tags: tagsOf(b.tags),
    agentCandidate: b.agentCandidate ? 1 : 0,
    createdAt: t,
    updatedAt: t,
    completedAt: null,
    archivedAt: null,
  };
  db.prepare(
    `INSERT INTO tasks (id, title, description, area, status, priority, dueDate, tags, agentCandidate, createdAt, updatedAt, completedAt, archivedAt)
     VALUES (@id, @title, @description, @area, @status, @priority, @dueDate, @tags, @agentCandidate, @createdAt, @updatedAt, @completedAt, @archivedAt)`
  ).run(task);
  return parseRow(db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id) as any);
}

tasksRouter.post("/", (req, res) => {
  try {
    const task = insertTask(req.body || {});
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
  updates.updatedAt = now();
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = @id`).run({ ...updates, id });
  return getEntity("task", id);
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
  if (!getEntity("task", req.params.id)) return fail(res, 404, "NOT_FOUND", "Task not found");
  const t = now();
  db.prepare(
    "UPDATE tasks SET status = 'done', completedAt = ?, updatedAt = ? WHERE id = ?"
  ).run(t, t, req.params.id);
  broadcast("data-changed", { entity: "task", id: req.params.id, op: "complete" });
  ok(res, getEntity("task", req.params.id));
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
