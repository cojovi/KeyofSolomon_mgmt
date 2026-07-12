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
  const today = nowIso.slice(0, 10); // YYYY-MM-DD
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const taskSelect = `SELECT t.*, p.title AS parentTaskTitle,
    (SELECT COUNT(*) FROM tasks c WHERE c.parentTaskId = t.id AND c.status != 'archived') AS subtaskCount,
    (SELECT COUNT(*) FROM tasks c WHERE c.parentTaskId = t.id AND c.status = 'done') AS completedSubtaskCount
    FROM tasks t LEFT JOIN tasks p ON p.id = t.parentTaskId`;

  const summary = {
    activeProjects: count("SELECT COUNT(*) n FROM projects WHERE status = 'active'"),
    openTasks: count("SELECT COUNT(*) n FROM tasks WHERE status IN ('todo','in_progress','waiting','blocked')"),
    blockedItems:
      count("SELECT COUNT(*) n FROM tasks WHERE status = 'blocked'") +
      count("SELECT COUNT(*) n FROM projects WHERE status = 'blocked'"),
    ideas: count("SELECT COUNT(*) n FROM ideas WHERE status NOT IN ('archived','converted')"),
    dueToday: count(
      "SELECT COUNT(*) n FROM tasks WHERE status NOT IN ('done','archived') AND dueDate IS NOT NULL AND substr(dueDate,1,10) = ?",
      today
    ),
    overdue: count(
      "SELECT COUNT(*) n FROM tasks WHERE status NOT IN ('done','archived') AND dueDate IS NOT NULL AND dueDate < ?",
      nowIso
    ),
    completedToday: count(
      "SELECT COUNT(*) n FROM tasks WHERE status = 'done' AND completedAt IS NOT NULL AND substr(completedAt,1,10) = ?",
      today
    ),
  };

  const projects = all(
    "SELECT * FROM projects WHERE status IN ('planning','active','paused','blocked') ORDER BY CASE status WHEN 'blocked' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, updatedAt DESC LIMIT 12"
  );

  const tasks = {
    inProgress: all(`${taskSelect} WHERE t.status = 'in_progress' ORDER BY t.updatedAt DESC LIMIT 8`),
    todo: all(`${taskSelect} WHERE t.status = 'todo' ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.updatedAt DESC LIMIT 8`),
    waiting: all(`${taskSelect} WHERE t.status = 'waiting' ORDER BY t.updatedAt DESC LIMIT 8`),
    blocked: all(`${taskSelect} WHERE t.status = 'blocked' ORDER BY t.updatedAt DESC LIMIT 8`),
    dueSoon: all(
      `${taskSelect} WHERE t.status NOT IN ('done','archived') AND t.dueDate IS NOT NULL AND t.dueDate <= ? ORDER BY t.dueDate ASC LIMIT 8`,
      soon
    ),
    dueToday: all(
      `${taskSelect} WHERE t.status NOT IN ('done','archived') AND t.dueDate IS NOT NULL AND substr(t.dueDate,1,10) = ? ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.dueDate ASC LIMIT 8`,
      today
    ),
    completedToday: all(
      `${taskSelect} WHERE t.status = 'done' AND t.completedAt IS NOT NULL AND substr(t.completedAt,1,10) = ? ORDER BY t.completedAt DESC LIMIT 8`,
      today
    ),
  };

  const ideas = all(
    "SELECT * FROM ideas WHERE status NOT IN ('archived','converted') ORDER BY updatedAt DESC LIMIT 12"
  );

  const recentNotes = all("SELECT * FROM notes ORDER BY createdAt DESC LIMIT 15");
  const agentActions = db.prepare("SELECT * FROM agent_actions ORDER BY createdAt DESC LIMIT 15").all();

  // Unified upcoming deadlines (tasks + projects) within the next 7 days, overdue first.
  const upcomingDeadlines = all(
    `SELECT id, title, dueDate, priority, status, 'task' AS kind FROM tasks
       WHERE status NOT IN ('done','archived') AND dueDate IS NOT NULL AND substr(dueDate,1,10) <= ?
     UNION ALL
     SELECT id, title, dueDate, priority, status, 'project' AS kind FROM projects
       WHERE status NOT IN ('completed','archived') AND dueDate IS NOT NULL AND substr(dueDate,1,10) <= ?
     ORDER BY dueDate ASC LIMIT 10`,
    in7Days, in7Days
  );

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
    upcomingDeadlines,
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
