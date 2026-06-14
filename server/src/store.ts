/**
 * store.ts — shared data-access helpers used by both the standard API
 * and the agent API so behavior stays consistent (logging, soft delete, etc).
 */
import { db } from "./db.js";
import { makeId, now, parseRow, parseRows } from "./helpers.js";

/* ---------- generic getters ---------- */

const TABLES: Record<string, string> = {
  project: "projects",
  task: "tasks",
  idea: "ideas",
  note: "notes",
};

export function getEntity(type: "project" | "task" | "idea" | "note", id: string) {
  return parseRow(
    db.prepare(`SELECT * FROM ${TABLES[type]} WHERE id = ?`).get(id) as any
  );
}

/* ---------- notes ---------- */

export function createNote(opts: {
  parentType: "project" | "task" | "idea";
  parentId: string;
  body: string;
  type?: string;
  createdBy?: string;
}) {
  const note = {
    id: makeId("note"),
    parentType: opts.parentType,
    parentId: opts.parentId,
    body: opts.body,
    type: opts.type || "note",
    createdBy: opts.createdBy || "user",
    createdAt: now(),
  };
  db.prepare(
    `INSERT INTO notes (id, parentType, parentId, body, type, createdBy, createdAt)
     VALUES (@id, @parentType, @parentId, @body, @type, @createdBy, @createdAt)`
  ).run(note);
  touchParent(opts.parentType, opts.parentId);
  return note;
}

export function notesFor(parentType: string, parentId: string) {
  return parseRows(
    db.prepare(
      "SELECT * FROM notes WHERE parentType = ? AND parentId = ? ORDER BY createdAt DESC"
    ).all(parentType, parentId)
  );
}

/* ---------- attachments ---------- */

export function createAttachment(opts: {
  parentType: string;
  parentId: string;
  label?: string;
  url?: string;
  filePath?: string;
  type?: string;
}) {
  const att = {
    id: makeId("att"),
    parentType: opts.parentType,
    parentId: opts.parentId,
    label: opts.label ?? null,
    url: opts.url ?? null,
    filePath: opts.filePath ?? null,
    type: opts.type || (opts.url ? "link" : "file"),
    createdAt: now(),
  };
  db.prepare(
    `INSERT INTO attachments (id, parentType, parentId, label, url, filePath, type, createdAt)
     VALUES (@id, @parentType, @parentId, @label, @url, @filePath, @type, @createdAt)`
  ).run(att);
  return att;
}

export function attachmentsFor(parentType: string, parentId: string) {
  return parseRows(
    db.prepare(
      "SELECT * FROM attachments WHERE parentType = ? AND parentId = ? ORDER BY createdAt DESC"
    ).all(parentType, parentId)
  );
}

/* ---------- agent action log ---------- */

export function logAgentAction(opts: {
  agentName: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  details?: string;
}) {
  const action = {
    id: makeId("act"),
    agentName: opts.agentName,
    actionType: opts.actionType,
    targetType: opts.targetType ?? null,
    targetId: opts.targetId ?? null,
    summary: opts.summary,
    details: opts.details ?? null,
    createdAt: now(),
  };
  db.prepare(
    `INSERT INTO agent_actions (id, agentName, actionType, targetType, targetId, summary, details, createdAt)
     VALUES (@id, @agentName, @actionType, @targetType, @targetId, @summary, @details, @createdAt)`
  ).run(action);
  return action;
}

/* ---------- archive (soft delete) ---------- */

export function archiveEntity(type: "project" | "task" | "idea", id: string) {
  const t = now();
  db.prepare(
    `UPDATE ${TABLES[type]} SET status = 'archived', archivedAt = ?, updatedAt = ? WHERE id = ?`
  ).run(t, t, id);
  return getEntity(type, id);
}

export function touchParent(type: "project" | "task" | "idea", id: string) {
  db.prepare(`UPDATE ${TABLES[type]} SET updatedAt = ? WHERE id = ?`).run(now(), id);
}
