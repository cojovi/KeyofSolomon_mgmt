/**
 * misc.ts — notes CRUD, attachments CRUD, agent action log, settings,
 * export/import, webhooks, approval system, AI summaries, fast capture.
 */
import { Router } from "express";
import { db, getSettings, setSetting } from "../db.js";
import {
  ok, fail, makeId, now, parseRows, parseRow, requireString, oneOf,
  ValidationError, NOTE_TYPES, PARENT_TYPES, ATTACH_PARENTS, ATTACH_TYPES,
  CREATED_BY, ACTION_TYPES,
} from "../helpers.js";
import { createAttachment, createNote, getEntity, logAgentAction } from "../store.js";
import { insertTask } from "./tasks.js";
import { insertIdea } from "./ideas.js";
import { broadcast } from "../events.js";
import { callAI, classifyCapture, generateSummary, getAIConfig, AIError } from "../ai.js";

/* ============ NOTES ============ */

export const notesRouter = Router();

notesRouter.get("/", (req, res) => {
  const { parentType, parentId, type, createdBy, limit } = req.query as Record<string, string>;
  let sql = "SELECT * FROM notes WHERE 1=1";
  const params: any[] = [];
  if (parentType) { sql += " AND parentType = ?"; params.push(parentType); }
  if (parentId) { sql += " AND parentId = ?"; params.push(parentId); }
  if (type) { sql += " AND type = ?"; params.push(type); }
  if (createdBy) { sql += " AND createdBy = ?"; params.push(createdBy); }
  sql += " ORDER BY createdAt DESC LIMIT ?";
  params.push(Math.min(Number(limit) || 100, 500));
  ok(res, parseRows(db.prepare(sql).all(...params)));
});

notesRouter.get("/:id", (req, res) => {
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
  if (!note) return fail(res, 404, "NOT_FOUND", "Note not found");
  ok(res, note);
});

notesRouter.post("/", (req, res) => {
  try {
    const b = req.body || {};
    const body = requireString(b, "body");
    if (!body) return fail(res, 400, "VALIDATION_ERROR", "Note body is required");
    const parentType = oneOf(b.parentType, PARENT_TYPES);
    if (!parentType) return fail(res, 400, "VALIDATION_ERROR", "parentType must be project, task, or idea");
    const parentId = requireString(b, "parentId");
    if (!parentId) return fail(res, 400, "VALIDATION_ERROR", "parentId is required");
    if (!getEntity(parentType as any, parentId))
      return fail(res, 404, "NOT_FOUND", `Parent ${parentType} '${parentId}' not found`);
    const note = createNote({
      parentType: parentType as any,
      parentId,
      body,
      type: oneOf(b.type, NOTE_TYPES) ?? "note",
      createdBy: oneOf(b.createdBy, CREATED_BY) ?? "user",
    });
    broadcast("data-changed", { entity: "note", id: note.id, op: "create" });
    ok(res, note, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

notesRouter.patch("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
    if (!existing) return fail(res, 404, "NOT_FOUND", "Note not found");
    const b = req.body || {};
    const updates: Record<string, any> = {};
    if (b.body !== undefined) {
      const body = requireString(b, "body");
      if (!body) return fail(res, 400, "VALIDATION_ERROR", "Note body cannot be empty");
      updates.body = body;
    }
    if (b.type !== undefined) updates.type = oneOf(b.type, NOTE_TYPES);
    if (Object.keys(updates).length === 0)
      return fail(res, 400, "VALIDATION_ERROR", "No valid fields to update");
    const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE notes SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
    broadcast("data-changed", { entity: "note", id: req.params.id, op: "update" });
    ok(res, db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id));
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

notesRouter.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
  if (!existing) return fail(res, 404, "NOT_FOUND", "Note not found");
  db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  broadcast("data-changed", { entity: "note", id: req.params.id, op: "delete" });
  ok(res, { deleted: true, id: req.params.id });
});

/* ============ ATTACHMENTS ============ */

export const attachmentsRouter = Router();

attachmentsRouter.get("/", (req, res) => {
  const { parentType, parentId, type } = req.query as Record<string, string>;
  let sql = "SELECT * FROM attachments WHERE 1=1";
  const params: any[] = [];
  if (parentType) { sql += " AND parentType = ?"; params.push(parentType); }
  if (parentId) { sql += " AND parentId = ?"; params.push(parentId); }
  if (type) { sql += " AND type = ?"; params.push(type); }
  sql += " ORDER BY createdAt DESC LIMIT 500";
  ok(res, parseRows(db.prepare(sql).all(...params)));
});

attachmentsRouter.get("/:id", (req, res) => {
  const att = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id);
  if (!att) return fail(res, 404, "NOT_FOUND", "Attachment not found");
  ok(res, att);
});

attachmentsRouter.post("/", (req, res) => {
  try {
    const b = req.body || {};
    const parentType = oneOf(b.parentType, ATTACH_PARENTS);
    if (!parentType) return fail(res, 400, "VALIDATION_ERROR", "parentType must be project, task, idea, or note");
    const parentId = requireString(b, "parentId");
    if (!parentId) return fail(res, 400, "VALIDATION_ERROR", "parentId is required");
    if (!b.url && !b.filePath)
      return fail(res, 400, "VALIDATION_ERROR", "Attachment needs a url or filePath");
    const att = createAttachment({
      parentType, parentId,
      label: b.label, url: b.url, filePath: b.filePath,
      type: oneOf(b.type, ATTACH_TYPES),
    });
    broadcast("data-changed", { entity: "attachment", id: att.id, op: "create" });
    ok(res, att, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

attachmentsRouter.patch("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id);
    if (!existing) return fail(res, 404, "NOT_FOUND", "Attachment not found");
    const b = req.body || {};
    const updates: Record<string, any> = {};
    for (const f of ["label", "url", "filePath"]) {
      if (b[f] !== undefined) updates[f] = b[f] === "" ? null : b[f];
    }
    if (b.type !== undefined) updates.type = oneOf(b.type, ATTACH_TYPES);
    if (Object.keys(updates).length === 0)
      return fail(res, 400, "VALIDATION_ERROR", "No valid fields to update");
    const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
    db.prepare(`UPDATE attachments SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
    broadcast("data-changed", { entity: "attachment", id: req.params.id, op: "update" });
    ok(res, db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id));
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

attachmentsRouter.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM attachments WHERE id = ?").get(req.params.id);
  if (!existing) return fail(res, 404, "NOT_FOUND", "Attachment not found");
  db.prepare("DELETE FROM attachments WHERE id = ?").run(req.params.id);
  broadcast("data-changed", { entity: "attachment", id: req.params.id, op: "delete" });
  ok(res, { deleted: true, id: req.params.id });
});

/* ============ SETTINGS ============ */

export const settingsRouter = Router();

const SETTING_KEYS = [
  "dashboardRefreshSeconds",
  "animationSpeed",
  "reducedMotion",
  "defaultDashboardMode",
  "aiProvider",
  "aiApiKey",
  "aiModel",
  "aiBaseUrl",
  "captureAutoClassify",
  "captureAutoBreakdown",
];

settingsRouter.get("/", (_req, res) => {
  ok(res, getSettings());
});

settingsRouter.patch("/", (req, res) => {
  const b = req.body || {};
  if (b.aiProvider !== undefined && !["none", "anthropic", "openai", "openrouter", "ollama"].includes(String(b.aiProvider))) {
    return fail(res, 400, "VALIDATION_ERROR", "Invalid AI provider");
  }
  const applied: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    if (b[key] !== undefined) {
      setSetting(key, String(b[key]));
      applied[key] = String(b[key]);
    }
  }
  if (Object.keys(applied).length === 0)
    return fail(res, 400, "VALIDATION_ERROR", `No valid settings. Valid keys: ${SETTING_KEYS.join(", ")}`);
  broadcast("settings-changed", applied);
  ok(res, getSettings());
});

/* ============ EXPORT / IMPORT ============ */

export const dataRouter = Router();

dataRouter.get("/export", (_req, res) => {
  const dump: Record<string, unknown> = { exportedAt: now(), version: "beta1" };
  for (const table of ["projects", "tasks", "ideas", "notes", "attachments", "agent_actions", "settings"]) {
    dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  ok(res, dump);
});

dataRouter.post("/import", (req, res) => {
  const b = req.body || {};
  if (b.version !== "beta1")
    return fail(res, 400, "VALIDATION_ERROR", "Import payload must be a Key of Solomon beta1 export (version: 'beta1')");
  const tables = ["projects", "tasks", "ideas", "notes", "attachments", "agent_actions"];
  const counts: Record<string, number> = {};
  const tx = db.transaction(() => {
    for (const table of tables) {
      const rows = Array.isArray(b[table]) ? b[table] : [];
      counts[table] = 0;
      for (const row of rows) {
        if (!row?.id) continue;
        const cols = Object.keys(row);
        const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => `@${c}`).join(",")})`;
        try { db.prepare(sql).run(row); counts[table]++; } catch { /* skip malformed rows */ }
      }
    }
  });
  tx();
  broadcast("data-changed", { entity: "all", op: "import" });
  ok(res, { imported: counts });
});

/* ============ AGENT ACTION LOG (raw) ============ */

export const agentActionsRouter = Router();

agentActionsRouter.get("/", (req, res) => {
  const { agentName, actionType, limit } = req.query as Record<string, string>;
  let sql = "SELECT * FROM agent_actions WHERE 1=1";
  const params: any[] = [];
  if (agentName) { sql += " AND agentName = ?"; params.push(agentName); }
  if (actionType) { sql += " AND actionType = ?"; params.push(actionType); }
  sql += " ORDER BY createdAt DESC LIMIT ?";
  params.push(Math.min(Number(limit) || 100, 500));
  ok(res, db.prepare(sql).all(...params));
});

agentActionsRouter.post("/", (req, res) => {
  try {
    const b = req.body || {};
    const agentName = requireString(b, "agentName") || "unknown-agent";
    const summary = requireString(b, "summary");
    if (!summary) return fail(res, 400, "VALIDATION_ERROR", "summary is required");
    const actionType = oneOf(b.actionType, ACTION_TYPES) ?? "update";
    const action = logAgentAction({
      agentName, actionType,
      targetType: b.targetType, targetId: b.targetId,
      summary, details: b.details,
    });
    broadcast("data-changed", { entity: "agent_action", id: action.id, op: "create" });
    ok(res, action, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

/* ============ WEBHOOKS (basic Beta 1) ============ */

export const webhooksRouter = Router();

webhooksRouter.post("/task", (req, res) => {
  try {
    const task = insertTask({ ...(req.body || {}), source: "webhook" });
    createNote({
      parentType: "task", parentId: task.id,
      body: `Created via webhook${req.body?.source ? ` from ${req.body.source}` : ""}`,
      type: "note", createdBy: "system",
    });
    broadcast("data-changed", { entity: "task", id: task.id, op: "create" });
    ok(res, task, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

webhooksRouter.post("/idea", (req, res) => {
  try {
    const idea = insertIdea(req.body || {});
    broadcast("data-changed", { entity: "idea", id: idea.id, op: "create" });
    ok(res, idea, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

webhooksRouter.post("/note", (req, res) => {
  try {
    const b = req.body || {};
    const body = requireString(b, "body");
    if (!body) return fail(res, 400, "VALIDATION_ERROR", "Note body is required");
    const parentType = oneOf(b.parentType, PARENT_TYPES);
    const parentId = requireString(b, "parentId");
    if (!parentType || !parentId)
      return fail(res, 400, "VALIDATION_ERROR", "parentType and parentId are required");
    if (!getEntity(parentType as any, parentId))
      return fail(res, 404, "NOT_FOUND", `Parent ${parentType} '${parentId}' not found`);
    const note = createNote({
      parentType: parentType as any, parentId, body,
      type: oneOf(b.type, NOTE_TYPES) ?? "note", createdBy: "system",
    });
    broadcast("data-changed", { entity: "note", id: note.id, op: "create" });
    ok(res, note, 201);
  } catch (e) {
    if (e instanceof ValidationError) return fail(res, 400, "VALIDATION_ERROR", e.message);
    throw e;
  }
});

webhooksRouter.post("/agent-update", (req, res) => {
  try {
    const b = req.body || {};
    const summary = requireString(b, "summary");
    if (!summary) return fail(res, 400, "VALIDATION_ERROR", "summary is required");
    const action = logAgentAction({
      agentName: b.agentName || "webhook",
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

/* ============ APPROVAL SYSTEM ============ */

export const approvalsRouter = Router();

const APPROVAL_ACTIONS = [
  "mark_complete", "archive", "set_urgent", "convert_idea_to_project",
  "modify_description", "delete_note", "bulk_update",
] as const;

approvalsRouter.get("/", (req, res) => {
  const { status } = req.query as Record<string, string>;
  let sql = "SELECT * FROM agent_approvals WHERE 1=1";
  const params: any[] = [];
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY requestedAt DESC LIMIT 100";
  ok(res, parseRows(db.prepare(sql).all(...params)));
});

approvalsRouter.get("/pending", (_req, res) => {
  ok(res, parseRows(db.prepare(
    "SELECT * FROM agent_approvals WHERE status = 'pending' ORDER BY requestedAt ASC"
  ).all()));
});

approvalsRouter.post("/", (req, res) => {
  const b = req.body || {};
  const reason = requireString(b, "reason");
  const payload = b.payload;
  if (!reason || !payload) return fail(res, 400, "VALIDATION_ERROR", "reason and payload are required");
  const approval = {
    id: makeId("appr"),
    agentName: b.agentName || "agent",
    actionType: b.actionType || "update",
    targetType: b.targetType ?? null,
    targetId: b.targetId ?? null,
    payload: JSON.stringify(payload),
    reason,
    status: "pending",
    requestedAt: now(),
    resolvedAt: null,
    resolvedBy: null,
  };
  db.prepare(
    `INSERT INTO agent_approvals (id, agentName, actionType, targetType, targetId, payload, reason, status, requestedAt, resolvedAt, resolvedBy)
     VALUES (@id, @agentName, @actionType, @targetType, @targetId, @payload, @reason, @status, @requestedAt, @resolvedAt, @resolvedBy)`
  ).run(approval);
  broadcast("data-changed", { entity: "approval", id: approval.id, op: "create" });
  ok(res, { ...approval, payload: JSON.parse(approval.payload) }, 201);
});

approvalsRouter.post("/:id/approve", (req, res) => {
  const row = db.prepare("SELECT * FROM agent_approvals WHERE id = ?").get(req.params.id) as any;
  if (!row) return fail(res, 404, "NOT_FOUND", "Approval not found");
  if (row.status !== "pending") return fail(res, 400, "ALREADY_RESOLVED", "Approval already resolved");
  db.prepare(
    "UPDATE agent_approvals SET status = 'approved', resolvedAt = ?, resolvedBy = 'user' WHERE id = ?"
  ).run(now(), req.params.id);
  broadcast("data-changed", { entity: "approval", id: req.params.id, op: "approved" });
  ok(res, { ...row, status: "approved", payload: JSON.parse(row.payload) });
});

approvalsRouter.post("/:id/reject", (req, res) => {
  const row = db.prepare("SELECT * FROM agent_approvals WHERE id = ?").get(req.params.id) as any;
  if (!row) return fail(res, 404, "NOT_FOUND", "Approval not found");
  if (row.status !== "pending") return fail(res, 400, "ALREADY_RESOLVED", "Approval already resolved");
  db.prepare(
    "UPDATE agent_approvals SET status = 'rejected', resolvedAt = ?, resolvedBy = 'user' WHERE id = ?"
  ).run(now(), req.params.id);
  broadcast("data-changed", { entity: "approval", id: req.params.id, op: "rejected" });
  ok(res, { ...row, status: "rejected", payload: JSON.parse(row.payload) });
});

/* ============ AI SUMMARIES ============ */

export const aiRouter = Router();

aiRouter.get("/config", (_req, res) => {
  const cfg = getAIConfig();
  // never expose API key over the API
  ok(res, { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, configured: cfg.provider !== "none" && !!cfg.apiKey });
});

const SUMMARY_TYPES = ["today_focus", "whats_blocked", "week_progress", "ideas_revisit", "agent_suggest"] as const;
type SummaryType = typeof SUMMARY_TYPES[number];

function buildSummaryContext(type: SummaryType) {
  const rows = (sql: string, ...p: any[]) =>
    (db.prepare(sql).all(...p) as any[]).map((r: any) => {
      try { if (r.tags) r.tags = JSON.parse(r.tags); } catch {}
      return r;
    });
  switch (type) {
    case "today_focus":
    case "agent_suggest":
      return {
        urgentTasks: rows("SELECT id,title,status,priority,dueDate FROM tasks WHERE priority='urgent' AND status NOT IN ('done','archived') LIMIT 5"),
        inProgress: rows("SELECT id,title,status,dueDate FROM tasks WHERE status='in_progress' LIMIT 8"),
        overdue: rows("SELECT id,title,dueDate FROM tasks WHERE status NOT IN ('done','archived') AND dueDate < ? LIMIT 5", new Date().toISOString()),
        blockedTasks: rows("SELECT id,title FROM tasks WHERE status='blocked' LIMIT 5"),
        activeProjects: rows("SELECT id,title,status,progressPercent FROM projects WHERE status='active' LIMIT 5"),
      };
    case "whats_blocked":
      return {
        blockedTasks: rows("SELECT id,title,description FROM tasks WHERE status='blocked' LIMIT 10"),
        blockedProjects: rows("SELECT id,title,shortDescription FROM projects WHERE status='blocked' LIMIT 5"),
        waitingTasks: rows("SELECT id,title FROM tasks WHERE status='waiting' LIMIT 5"),
      };
    case "week_progress":
      return {
        completedThisWeek: rows("SELECT id,title,completedAt FROM tasks WHERE status='done' AND completedAt > ? LIMIT 10",
          new Date(Date.now() - 7 * 86400_000).toISOString()),
        activeProjects: rows("SELECT id,title,progressPercent FROM projects WHERE status='active' LIMIT 8"),
        recentNotes: rows("SELECT body,createdAt FROM notes ORDER BY createdAt DESC LIMIT 10"),
      };
    case "ideas_revisit":
      return {
        capturedIdeas: rows("SELECT id,title,body,createdAt FROM ideas WHERE status IN ('captured','reviewing','possible') ORDER BY createdAt DESC LIMIT 10"),
        highPriorityIdeas: rows("SELECT id,title,body FROM ideas WHERE priority='high' AND status NOT IN ('converted','archived') LIMIT 5"),
      };
  }
}

aiRouter.get("/summaries", (_req, res) => {
  const rows = db.prepare("SELECT * FROM ai_summaries ORDER BY generatedAt DESC").all() as any[];
  const latest: Record<string, any> = {};
  for (const r of rows) {
    if (!latest[r.type]) latest[r.type] = r;
  }
  ok(res, Object.values(latest));
});

aiRouter.post("/summaries/:type", async (req, res) => {
  const type = req.params.type as SummaryType;
  if (!SUMMARY_TYPES.includes(type))
    return fail(res, 400, "VALIDATION_ERROR", `type must be one of: ${SUMMARY_TYPES.join(", ")}`);

  try {
    const context = buildSummaryContext(type);
    const content = await generateSummary(type, context);
    const cfg = getAIConfig();
    const summary = {
      id: makeId("sum"),
      type,
      content,
      generatedAt: now(),
      provider: cfg.provider,
    };
    db.prepare(
      "INSERT INTO ai_summaries (id, type, content, generatedAt, provider) VALUES (@id, @type, @content, @generatedAt, @provider)"
    ).run(summary);
    broadcast("data-changed", { entity: "ai_summary", id: summary.id, op: "create" });
    ok(res, summary, 201);
  } catch (e) {
    if (e instanceof AIError) return fail(res, 503, e.code, e.message);
    throw e;
  }
});

/* ============ FAST CAPTURE ============ */

export const captureRouter = Router();

captureRouter.post("/", async (req, res) => {
  const b = req.body || {};
  const text = requireString(b, "text");
  if (!text) return fail(res, 400, "VALIDATION_ERROR", "text is required");

  const forceType = b.type as string | undefined;
  const settings = getSettings();

  if (forceType || settings.captureAutoClassify !== "true") {
    // manual type specified or auto-classify disabled
    const type = forceType || "task";
    let created: any;
    if (type === "task") created = insertTask({ title: text, area: b.area, source: "fast_capture" });
    else if (type === "idea") created = insertIdea({ title: text });
    else if (type === "note") {
      // create a floating note — attach to a special "capture" bucket or return raw
      created = { type: "note", content: text, note: "No parent — save as reminder" };
    }
    broadcast("data-changed", { entity: type, op: "create" });
    ok(res, { classified: false, type, created }, 201);
    return;
  }

  // AI classification
  try {
    const classification = await classifyCapture(text);
    let created: any;
    let subtasks: any[] = [];
    if (classification.type === "task") {
      const result = db.transaction(() => {
        const parent = insertTask({
          title: classification.title,
          description: classification.title.toLowerCase() === text.toLowerCase() ? undefined : text,
          area: classification.area,
          source: "fast_capture",
        });
        const plannedSubtasks = settings.captureAutoBreakdown === "true" ? classification.subtasks : [];
        const children = plannedSubtasks.map((title) => insertTask({
          title,
          area: classification.area,
          parentTaskId: parent.id,
          source: "embedded_ai",
        }));
        if (children.length > 0) {
          createNote({
            parentType: "task",
            parentId: parent.id,
            body: `Embedded AI created the initial ${children.length}-item subtask plan during Fast Capture.`,
            type: "note",
            createdBy: "system",
          });
        }
        return { parent, children };
      })();
      created = result.parent;
      subtasks = result.children;
    } else if (classification.type === "idea") {
      created = insertIdea({ title: classification.title });
    } else if (classification.type === "project") {
      // create as idea with "project" note, agent can promote later
      created = insertIdea({ title: classification.title, category: "project-seed" });
    } else {
      created = insertTask({ title: classification.title, source: "fast_capture" });
    }
    broadcast("data-changed", { entity: classification.type, op: "create" });
    ok(res, { classified: true, ...classification, created, subtasks }, 201);
  } catch (e) {
    if (e instanceof AIError) {
      // fallback: save as task without classification
      const created = insertTask({ title: text, source: "fast_capture" });
      broadcast("data-changed", { entity: "task", op: "create" });
      ok(res, { classified: false, type: "task", aiError: e.message, created }, 201);
      return;
    }
    throw e;
  }
});
