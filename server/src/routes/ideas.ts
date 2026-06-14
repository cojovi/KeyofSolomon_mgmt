import { Router } from "express";
import { db } from "../db.js";
import {
  ok, fail, makeId, now, parseRow, parseRows, requireString, oneOf, tagsOf,
  ValidationError, IDEA_STATUSES, PRIORITIES, NOTE_TYPES,
} from "../helpers.js";
import { archiveEntity, createNote, getEntity, notesFor } from "../store.js";
import { insertTask } from "./tasks.js";
import { broadcast } from "../events.js";

export const ideasRouter = Router();

const IDEA_PRIORITIES = ["low", "medium", "high"] as const;

ideasRouter.get("/", (req, res) => {
  const { status, category, priority, q, includeArchived } = req.query as Record<string, string>;
  let sql = "SELECT * FROM ideas WHERE 1=1";
  const params: any[] = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  else if (includeArchived !== "true") { sql += " AND status != 'archived'"; }
  if (category) { sql += " AND category = ?"; params.push(category); }
  if (priority) { sql += " AND priority = ?"; params.push(priority); }
  if (q) {
    sql += " AND (title LIKE ? OR body LIKE ? OR tags LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += " ORDER BY updatedAt DESC";
  ok(res, parseRows(db.prepare(sql).all(...params)));
});

ideasRouter.get("/:id", (req, res) => {
  const idea = getEntity("idea", req.params.id);
  if (!idea) return fail(res, 404, "NOT_FOUND", "Idea not found");
  ok(res, { ...idea, notes: notesFor("idea", idea.id) });
});

export function insertIdea(b: Record<string, any>): any {
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) throw new ValidationError("Title is required");
  const t = now();
  const idea = {
    id: makeId("idea"),
    title,
    body: b.body ?? null,
    category: b.category ?? null,
    status: oneOf(b.status, IDEA_STATUSES) ?? "captured",
    priority: oneOf(b.priority, IDEA_PRIORITIES) ?? null,
    tags: tagsOf(b.tags),
    createdAt: t,
    updatedAt: t,
    convertedToType: null,
    convertedToId: null,
    archivedAt: null,
  };
  db.prepare(
    `INSERT INTO ideas (id, title, body, category, status, priority, tags, createdAt, updatedAt, convertedToType, convertedToId, archivedAt)
     VALUES (@id, @title, @body, @category, @status, @priority, @tags, @createdAt, @updatedAt, @convertedToType, @convertedToId, @archivedAt)`
  ).run(idea);
  return parseRow(db.prepare("SELECT * FROM ideas WHERE id = ?").get(idea.id) as any);
}

ideasRouter.post("/", (req, res) => {
  try {
    const idea = insertIdea(req.body || {});
    broadcast("data-changed", { entity: "idea", id: idea.id, op: "create" });
    ok(res, idea, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

ideasRouter.patch("/:id", (req, res) => {
  try {
    if (!getEntity("idea", req.params.id)) return fail(res, 404, "NOT_FOUND", "Idea not found");
    const b = req.body || {};
    const updates: Record<string, any> = {};
    if (b.title !== undefined) {
      const title = requireString(b, "title");
      if (!title) return fail(res, 400, "VALIDATION_ERROR", "Title cannot be empty");
      updates.title = title;
    }
    for (const f of ["body", "category"]) {
      if (b[f] !== undefined) updates[f] = b[f] === "" ? null : b[f];
    }
    if (b.status !== undefined) {
      updates.status = oneOf(b.status, IDEA_STATUSES);
      if (updates.status === "archived") updates.archivedAt = now();
      else updates.archivedAt = null;
    }
    if (b.priority !== undefined) updates.priority = oneOf(b.priority, IDEA_PRIORITIES) ?? null;
    if (b.tags !== undefined) updates.tags = tagsOf(b.tags);
    if (Object.keys(updates).length === 0)
      return fail(res, 400, "VALIDATION_ERROR", "No valid fields to update");
    updates.updatedAt = now();
    const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE ideas SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
    broadcast("data-changed", { entity: "idea", id: req.params.id, op: "update" });
    ok(res, getEntity("idea", req.params.id));
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

// DELETE soft-archives in Beta 1
ideasRouter.delete("/:id", (req, res) => {
  if (!getEntity("idea", req.params.id)) return fail(res, 404, "NOT_FOUND", "Idea not found");
  const archived = archiveEntity("idea", req.params.id);
  broadcast("data-changed", { entity: "idea", id: req.params.id, op: "archive" });
  ok(res, { archived: true, idea: archived });
});

ideasRouter.post("/:id/archive", (req, res) => {
  if (!getEntity("idea", req.params.id)) return fail(res, 404, "NOT_FOUND", "Idea not found");
  const archived = archiveEntity("idea", req.params.id);
  broadcast("data-changed", { entity: "idea", id: req.params.id, op: "archive" });
  ok(res, archived);
});

/** Shared conversion logic (also used by the agent API). */
export function convertIdea(
  ideaId: string,
  target: "task" | "project",
  overrides: Record<string, any> = {},
  createdBy: "user" | "agent" = "user"
): { converted: any; idea: any } {
  const idea = getEntity("idea", ideaId);
  if (!idea) throw new ValidationError("Idea not found");
  if (idea.status === "converted") throw new ValidationError("Idea was already converted");

  let converted: any;
  if (target === "task") {
    converted = insertTask({
      title: overrides.title ?? idea.title,
      description: overrides.description ?? idea.body,
      area: overrides.area ?? idea.category,
      priority: overrides.priority ?? idea.priority,
      tags: overrides.tags ?? idea.tags,
      dueDate: overrides.dueDate,
      agentCandidate: overrides.agentCandidate ?? false,
    });
  } else {
    const t = now();
    const project = {
      id: makeId("proj"),
      title: overrides.title ?? idea.title,
      shortDescription: overrides.shortDescription ?? idea.body,
      longDescription: overrides.longDescription ?? null,
      category: overrides.category ?? idea.category,
      status: "planning",
      priority: overrides.priority ?? idea.priority,
      progressPercent: 0,
      tags: tagsOf(overrides.tags ?? idea.tags),
      dueDate: overrides.dueDate ?? null,
      createdAt: t,
      updatedAt: t,
      archivedAt: null,
    };
    db.prepare(
      `INSERT INTO projects (id, title, shortDescription, longDescription, category, status, priority, progressPercent, tags, dueDate, createdAt, updatedAt, archivedAt)
       VALUES (@id, @title, @shortDescription, @longDescription, @category, @status, @priority, @progressPercent, @tags, @dueDate, @createdAt, @updatedAt, @archivedAt)`
    ).run(project);
    converted = parseRow(db.prepare("SELECT * FROM projects WHERE id = ?").get(project.id) as any);
  }

  db.prepare(
    "UPDATE ideas SET status = 'converted', convertedToType = ?, convertedToId = ?, updatedAt = ? WHERE id = ?"
  ).run(target, converted.id, now(), ideaId);

  createNote({
    parentType: "idea",
    parentId: ideaId,
    body: `Converted to ${target} '${converted.title}' (${converted.id})`,
    type: "decision",
    createdBy: createdBy === "agent" ? "agent" : "system",
  });

  return { converted, idea: getEntity("idea", ideaId) };
}

ideasRouter.post("/:id/convert-to-task", (req, res) => {
  try {
    const result = convertIdea(req.params.id, "task", req.body || {});
    broadcast("data-changed", { entity: "idea", id: req.params.id, op: "convert" });
    ok(res, { task: result.converted, idea: result.idea }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

ideasRouter.post("/:id/convert-to-project", (req, res) => {
  try {
    const result = convertIdea(req.params.id, "project", req.body || {});
    broadcast("data-changed", { entity: "idea", id: req.params.id, op: "convert" });
    ok(res, { project: result.converted, idea: result.idea }, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

ideasRouter.get("/:id/notes", (req, res) => {
  if (!getEntity("idea", req.params.id)) return fail(res, 404, "NOT_FOUND", "Idea not found");
  ok(res, notesFor("idea", req.params.id));
});

ideasRouter.post("/:id/notes", (req, res) => {
  try {
    if (!getEntity("idea", req.params.id)) return fail(res, 404, "NOT_FOUND", "Idea not found");
    const body = requireString(req.body, "body");
    if (!body) return fail(res, 400, "VALIDATION_ERROR", "Note body is required");
    const note = createNote({
      parentType: "idea",
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
