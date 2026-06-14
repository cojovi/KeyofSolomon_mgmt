import { Router } from "express";
import { db, getSettings } from "../db.js";
import { ok, now, parseRows } from "../helpers.js";

export const dashboardRouter = Router();

/** Builds the entire payload the live dashboard needs in one call. */
export function buildDashboardState() {
  const all = (sql: string, ...params: any[]) => parseRows(db.prepare(sql).all(...params));
  const count = (sql: string, ...params: any[]) =>
    (db.prepare(sql).get(...params) as { n: number }).n;

  const nowIso = now();
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const summary = {
    activeProjects: count("SELECT COUNT(*) n FROM projects WHERE status = 'active'"),
    openTasks: count("SELECT COUNT(*) n FROM tasks WHERE status IN ('todo','in_progress','waiting','blocked')"),
    blockedItems:
      count("SELECT COUNT(*) n FROM tasks WHERE status = 'blocked'") +
      count("SELECT COUNT(*) n FROM projects WHERE status = 'blocked'"),
    ideas: count("SELECT COUNT(*) n FROM ideas WHERE status NOT IN ('archived','converted')"),
  };

  const projects = all(
    "SELECT * FROM projects WHERE status IN ('planning','active','paused','blocked') ORDER BY CASE status WHEN 'blocked' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, updatedAt DESC LIMIT 12"
  );

  const tasks = {
    inProgress: all("SELECT * FROM tasks WHERE status = 'in_progress' ORDER BY updatedAt DESC LIMIT 8"),
    todo: all("SELECT * FROM tasks WHERE status = 'todo' ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, updatedAt DESC LIMIT 8"),
    waiting: all("SELECT * FROM tasks WHERE status = 'waiting' ORDER BY updatedAt DESC LIMIT 8"),
    blocked: all("SELECT * FROM tasks WHERE status = 'blocked' ORDER BY updatedAt DESC LIMIT 8"),
    dueSoon: all(
      "SELECT * FROM tasks WHERE status NOT IN ('done','archived') AND dueDate IS NOT NULL AND dueDate <= ? ORDER BY dueDate ASC LIMIT 8",
      soon
    ),
  };

  const ideas = all(
    "SELECT * FROM ideas WHERE status NOT IN ('archived','converted') ORDER BY updatedAt DESC LIMIT 12"
  );

  const recentNotes = all("SELECT * FROM notes ORDER BY createdAt DESC LIMIT 15");
  const agentActions = db.prepare("SELECT * FROM agent_actions ORDER BY createdAt DESC LIMIT 15").all();

  /* ---- ticker assembly ---- */
  type TickerItem = { type: string; label: string; text: string; targetType?: string; targetId?: string };
  const ticker: TickerItem[] = [];

  const urgentTasks = all(
    "SELECT * FROM tasks WHERE priority = 'urgent' AND status NOT IN ('done','archived') ORDER BY updatedAt DESC LIMIT 6"
  );
  for (const t of urgentTasks)
    ticker.push({ type: "urgent", label: "URGENT", text: t.title, targetType: "task", targetId: t.id });

  const overdue = all(
    "SELECT * FROM tasks WHERE status NOT IN ('done','archived') AND dueDate IS NOT NULL AND dueDate < ? ORDER BY dueDate ASC LIMIT 6",
    nowIso
  );
  for (const t of overdue)
    ticker.push({ type: "overdue", label: "OVERDUE", text: t.title, targetType: "task", targetId: t.id });

  for (const t of tasks.blocked.slice(0, 4))
    ticker.push({ type: "blocked", label: "BLOCKED", text: t.title, targetType: "task", targetId: t.id });

  const blockedProjects = all("SELECT * FROM projects WHERE status = 'blocked' LIMIT 4");
  for (const p of blockedProjects)
    ticker.push({ type: "blocked", label: "BLOCKED", text: p.title, targetType: "project", targetId: p.id });

  // stale: not updated in 14 days, still open
  const staleCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const stale = all(
    "SELECT * FROM tasks WHERE status IN ('todo','in_progress','waiting') AND updatedAt < ? ORDER BY updatedAt ASC LIMIT 4",
    staleCutoff
  );
  for (const t of stale)
    ticker.push({ type: "stale", label: "STALE", text: t.title, targetType: "task", targetId: t.id });

  const hotIdeas = all(
    "SELECT * FROM ideas WHERE priority = 'high' AND status NOT IN ('archived','converted') ORDER BY updatedAt DESC LIMIT 4"
  );
  for (const i of hotIdeas)
    ticker.push({ type: "idea", label: "IDEA", text: i.title, targetType: "idea", targetId: i.id });

  for (const a of (agentActions as any[]).slice(0, 4))
    ticker.push({ type: "agent", label: "AGENT", text: `${a.agentName}: ${a.summary}`, targetType: a.targetType ?? undefined, targetId: a.targetId ?? undefined });

  const recentlyUpdated = all(
    "SELECT id, title, updatedAt, 'project' as kind FROM projects WHERE status != 'archived' UNION ALL SELECT id, title, updatedAt, 'task' as kind FROM tasks WHERE status != 'archived' ORDER BY updatedAt DESC LIMIT 5"
  );
  for (const r of recentlyUpdated.slice(0, 3))
    ticker.push({ type: "updated", label: "UPDATED", text: r.title, targetType: r.kind, targetId: r.id });

  return {
    generatedAt: nowIso,
    summary,
    ticker,
    projects,
    tasks,
    ideas,
    recentNotes,
    agentActions,
    settings: getSettings(),
  };
}

// Canonical endpoint.
dashboardRouter.get("/state", (_req, res) => {
  ok(res, buildDashboardState());
});

// Backward-compatible alias: some clients call GET /api/v1/dashboard directly.
// Without this the bare path 404s and the live dashboard hangs on "loading…".
dashboardRouter.get("/", (_req, res) => {
  ok(res, buildDashboardState());
});
