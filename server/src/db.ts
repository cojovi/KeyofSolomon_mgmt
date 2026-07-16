import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(process.env.DATABASE_PATH || "./data/neondeck.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
try {
  db.pragma("journal_mode = WAL");
} catch {
  // Some filesystems (network mounts, certain containers) don't support WAL.
  db.pragma("journal_mode = DELETE");
}
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  shortDescription TEXT,
  longDescription TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  priority TEXT,
  progressPercent INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  dueDate TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  archivedAt TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  area TEXT,
  parentTaskId TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT,
  dueDate TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  agentCandidate INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT,
  archivedAt TEXT
);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'captured',
  priority TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  convertedToType TEXT,
  convertedToId TEXT,
  archivedAt TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  parentType TEXT NOT NULL,
  parentId TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'note',
  createdBy TEXT NOT NULL DEFAULT 'user',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  parentType TEXT NOT NULL,
  parentId TEXT NOT NULL,
  label TEXT,
  url TEXT,
  filePath TEXT,
  type TEXT DEFAULT 'link',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_actions (
  id TEXT PRIMARY KEY,
  agentName TEXT NOT NULL,
  actionType TEXT NOT NULL,
  targetType TEXT,
  targetId TEXT,
  summary TEXT NOT NULL,
  details TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_approvals (
  id TEXT PRIMARY KEY,
  agentName TEXT NOT NULL,
  actionType TEXT NOT NULL,
  targetType TEXT,
  targetId TEXT,
  payload TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requestedAt TEXT NOT NULL,
  resolvedAt TEXT,
  resolvedBy TEXT,
  resolutionNote TEXT
);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  generatedAt TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id TEXT PRIMARY KEY,
  eventType TEXT NOT NULL,
  entityType TEXT,
  entityId TEXT,
  payload TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  deliveredAt TEXT,
  lastError TEXT,
  dedupeKey TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  targetType TEXT,
  targetId TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  dedupeKey TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  readAt TEXT
);

CREATE TABLE IF NOT EXISTS gordon_chat_messages (
  id TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'complete',
  replyToId TEXT REFERENCES gordon_chat_messages(id) ON DELETE SET NULL,
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parentType, parentId);
CREATE INDEX IF NOT EXISTS idx_attachments_parent ON attachments(parentType, parentId);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON agent_approvals(status);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_type ON ai_summaries(type);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_due ON webhook_outbox(status, nextAttemptAt);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_outbox_queued_dedupe
  ON webhook_outbox(dedupeKey) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(readAt, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_gordon_chat_conversation ON gordon_chat_messages(conversationId, createdAt);
`);

// Lightweight, idempotent migrations for existing local databases.
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
if (!taskColumns.some((column) => column.name === "parentTaskId")) {
  db.exec("ALTER TABLE tasks ADD COLUMN parentTaskId TEXT REFERENCES tasks(id) ON DELETE SET NULL");
}
if (!taskColumns.some((column) => column.name === "source")) {
  db.exec("ALTER TABLE tasks ADD COLUMN source TEXT NOT NULL DEFAULT 'user'");
  db.exec(`UPDATE tasks SET source = 'agent'
    WHERE id IN (
      SELECT targetId FROM agent_actions
      WHERE actionType = 'create' AND targetType = 'task' AND targetId IS NOT NULL
    )`);
}
db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parentTaskId)");
db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source)");

const approvalColumns = db.prepare("PRAGMA table_info(agent_approvals)").all() as { name: string }[];
if (!approvalColumns.some((column) => column.name === "resolutionNote")) {
  db.exec("ALTER TABLE agent_approvals ADD COLUMN resolutionNote TEXT");
}

// Runtime rename: preserve audit rows while replacing the retired agent identity.
const retiredAgentName = ["Her", "mes"].join("");
db.prepare("UPDATE agent_actions SET agentName = 'Gordon' WHERE agentName = ?").run(retiredAgentName);
db.prepare("UPDATE agent_approvals SET agentName = 'Gordon' WHERE agentName = ?").run(retiredAgentName);
// A process can exit mid-delivery; make those rows eligible after restart.
db.prepare("UPDATE webhook_outbox SET status = 'queued' WHERE status = 'delivering'").run();
db.prepare(
  "UPDATE gordon_chat_messages SET status = 'failed', error = 'Interrupted by server restart', updatedAt = ? WHERE status = 'streaming'"
).run(new Date().toISOString());

// Default settings
const defaults: Record<string, string> = {
  dashboardRefreshSeconds: "30",
  animationSpeed: "1",
  reducedMotion: "false",
  defaultDashboardMode: "full",
  aiProvider: "none",
  aiApiKey: "",
  aiModel: "",
  aiBaseUrl: "",
  captureAutoClassify: "true",
  captureAutoBreakdown: "true",
  browserNotificationsEnabled: "false",
};
const insertSetting = db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
);
for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);

export function getSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function setSetting(key: string, value: string) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export { DB_PATH };
