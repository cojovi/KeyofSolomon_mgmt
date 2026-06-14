import { Router } from "express";
import { db } from "../db.js";
import {
  ok, fail, makeId, now, parseRow, parseRows, requireString, oneOf, tagsOf,
  clampProgress, ValidationError, PROJECT_STATUSES, PRIORITIES, NOTE_TYPES,
} from "../helpers.js";
import { archiveEntity, attachmentsFor, createAttachment, createNote, getEntity, notesFor } from "../store.js";
import { broadcast } from "../events.js";

export const projectsRouter = Router();

projectsRouter.get("/", (req, res) => {
  const { status, category, priority, q, includeArchived } = req.query as Record<string, string>;
  let sql = "SELECT * FROM projects WHERE 1=1";
  const params: any[] = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  else if (includeArchived !== "true") { sql += " AND status != 'archived'"; }
  if (category) { sql += " AND category = ?"; params.push(category); }
  if (priority) { sql += " AND priority = ?"; params.push(priority); }
  if (q) {
    sql += " AND (title LIKE ? OR shortDescription LIKE ? OR longDescription LIKE ? OR tags LIKE ?)";
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += " ORDER BY updatedAt DESC";
  ok(res, parseRows(db.prepare(sql).all(...params)));
});

projectsRouter.get("/:id", (req, res) => {
  const project = getEntity("project", req.params.id);
  if (!project) return fail(res, 404, "NOT_FOUND", "Project not found");
  ok(res, {
    ...project,
    notes: notesFor("project", project.id),
    attachments: attachmentsFor("project", project.id),
  });
});

projectsRouter.post("/", (req, res) => {
  try {
    const title = requireString(req.body, "title");
    if (!title) return fail(res, 400, "VALIDATION_ERROR", "Title is required");
    const b = req.body || {};
    const t = now();
    const project = {
      id: makeId("proj"),
      title,
      shortDescription: b.shortDescription ?? null,
      longDescription: b.longDescription ?? null,
      category: b.category ?? null,
      status: oneOf(b.status, PROJECT_STATUSES) ?? "planning",
      priority: oneOf(b.priority, PRIORITIES) ?? null,
      progressPercent: b.progressPercent !== undefined ? clampProgress(b.progressPercent) : 0,
      tags: tagsOf(b.tags),
      dueDate: b.dueDate ?? null,
      createdAt: t,
      updatedAt: t,
      archivedAt: null,
    };
    db.prepare(
      `INSERT INTO projects (id, title, shortDescription, longDescription, category, status, priority, progressPercent, tags, dueDate, createdAt, updatedAt, archivedAt)
       VALUES (@id, @title, @shortDescription, @longDescription, @category, @status, @priority, @progressPercent, @tags, @dueDate, @createdAt, @updatedAt, @archivedAt)`
    ).run(project);
    broadcast("data-changed", { entity: "project", id: project.id, op: "create" });
    ok(res, parseRow(db.prepare("SELECT * FROM projects WHERE id = ?").get(project.id) as any), 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

projectsRouter.patch("/:id", (req, res) => {
  try {
    const existing = getEntity("project", req.params.id);
    if (!existing) return fail(res, 404, "NOT_FOUND", "Project not found");
    const b = req.body || {};
    const updates: Record<string, any> = {};
    if (b.title !== undefined) {
      const title = requireString(b, "title");
      if (!title) return fail(res, 400, "VALIDATION_ERROR", "Title cannot be empty");
      updates.title = title;
    }
    for (const f of ["shortDescription", "longDescription", "category", "dueDate"]) {
      if (b[f] !== undefined) updates[f] = b[f] === "" ? null : b[f];
    }
    if (b.status !== undefined) updates.status = oneOf(b.status, PROJECT_STATUSES);
    if (b.priority !== undefined) updates.priority = oneOf(b.priority, PRIORITIES) ?? null;
    if (b.progressPercent !== undefined) updates.progressPercent = clampProgress(b.progressPercent);
    if (b.tags !== undefined) updates.tags = tagsOf(b.tags);
    if (updates.status === "archived") updates.archivedAt = now();
    if (updates.status && updates.status !== "archived") updates.archivedAt = null;

    if (Object.keys(updates).length === 0)
      return fail(res, 400, "VALIDATION_ERROR", "No valid fields to update");
    updates.updatedAt = now();
    const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE projects SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
    broadcast("data-changed", { entity: "project", id: req.params.id, op: "update" });
    ok(res, getEntity("project", req.params.id));
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

// DELETE soft-archives in Beta 1 (no hard deletes of projects)
projectsRouter.delete("/:id", (req, res) => {
  const existing = getEntity("project", req.params.id);
  if (!existing) return fail(res, 404, "NOT_FOUND", "Project not found");
  const archived = archiveEntity("project", req.params.id);
  broadcast("data-changed", { entity: "project", id: req.params.id, op: "archive" });
  ok(res, { archived: true, project: archived });
});

projectsRouter.post("/:id/archive", (req, res) => {
  const existing = getEntity("project", req.params.id);
  if (!existing) return fail(res, 404, "NOT_FOUND", "Project not found");
  const archived = archiveEntity("project", req.params.id);
  broadcast("data-changed", { entity: "project", id: req.params.id, op: "archive" });
  ok(res, archived);
});

projectsRouter.get("/:id/notes", (req, res) => {
  if (!getEntity("project", req.params.id)) return fail(res, 404, "NOT_FOUND", "Project not found");
  ok(res, notesFor("project", req.params.id));
});

projectsRouter.post("/:id/notes", (req, res) => {
  try {
    if (!getEntity("project", req.params.id)) return fail(res, 404, "NOT_FOUND", "Project not found");
    const body = requireString(req.body, "body");
    if (!body) return fail(res, 400, "VALIDATION_ERROR", "Note body is required");
    const note = createNote({
      parentType: "project",
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

projectsRouter.get("/:id/attachments", (req, res) => {
  if (!getEntity("project", req.params.id)) return fail(res, 404, "NOT_FOUND", "Project not found");
  ok(res, attachmentsFor("project", req.params.id));
});

projectsRouter.post("/:id/attachments", (req, res) => {
  if (!getEntity("project", req.params.id)) return fail(res, 404, "NOT_FOUND", "Project not found");
  const b = req.body || {};
  if (!b.url && !b.filePath)
    return fail(res, 400, "VALIDATION_ERROR", "Attachment needs a url or filePath");
  const att = createAttachment({
    parentType: "project", parentId: req.params.id,
    label: b.label, url: b.url, filePath: b.filePath, type: b.type,
  });
  broadcast("data-changed", { entity: "attachment", id: att.id, op: "create" });
  ok(res, att, 201);
});
