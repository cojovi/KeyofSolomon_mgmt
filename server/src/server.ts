import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { db, DB_PATH } from "./db.js";
import { ok, authMiddleware, getToken } from "./helpers.js";
import { addClient } from "./events.js";
import { projectsRouter } from "./routes/projects.js";
import { tasksRouter } from "./routes/tasks.js";
import { ideasRouter } from "./routes/ideas.js";
import {
  notesRouter, attachmentsRouter, settingsRouter, dataRouter,
  agentActionsRouter, webhooksRouter, approvalsRouter, aiRouter, captureRouter,
} from "./routes/misc.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { agentRouter } from "./routes/agent.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REACT_DIST = join(__dirname, "..", "..", "frontend", "dist");
const LEGACY_PUBLIC = join(__dirname, "..", "..", "public");
const PORT = Number(process.env.PORT) || 8787;

// Prefer the compiled React frontend; fall back to legacy vanilla HTML
const useReact = existsSync(join(REACT_DIST, "index.html"));
const PUBLIC_DIR = useReact ? REACT_DIST : LEGACY_PUBLIC;

const app = express();
app.use(express.json({ limit: "5mb" }));

/* ---------- UI (no auth needed) ---------- */

if (useReact) {
  // Serve React SPA — all non-API routes get index.html
  app.use(express.static(REACT_DIST));
} else {
  // Legacy vanilla HTML
  app.use("/assets", express.static(join(LEGACY_PUBLIC, "assets")));
  app.get("/app", (_req, res) => res.sendFile(join(LEGACY_PUBLIC, "app", "index.html")));
  app.get("/dashboard", (_req, res) => res.sendFile(join(LEGACY_PUBLIC, "dashboard", "index.html")));
}

/**
 * Localhost-only token hand-off for the UI.
 */
app.get("/ui-config", (req, res) => {
  const ip = req.socket.remoteAddress || "";
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocal) {
    return res.status(403).json({ success: false, data: null, error: { code: "FORBIDDEN", message: "ui-config is localhost-only" } });
  }
  res.json({ success: true, data: { apiBase: `/api/v1`, token: getToken() }, error: null });
});

/* ---------- API ---------- */

const api = express.Router();
api.use(authMiddleware);

api.get("/health", (_req, res) => {
  ok(res, {
    status: "ok",
    app: "Key of Solomon",
    version: "0.2.0-beta.2",
    time: new Date().toISOString(),
    database: DB_PATH,
    frontend: useReact ? "react" : "legacy",
  });
});

// Server-Sent Events
api.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`event: connected\ndata: {"ok":true}\n\n`);
  addClient(res);
});

api.use("/projects", projectsRouter);
api.use("/tasks", tasksRouter);
api.use("/ideas", ideasRouter);
api.use("/notes", notesRouter);
api.use("/attachments", attachmentsRouter);
api.use("/settings", settingsRouter);
api.use("/data", dataRouter);
api.use("/dashboard", dashboardRouter);
api.use("/webhooks", webhooksRouter);
api.use("/approvals", approvalsRouter);
api.use("/ai", aiRouter);
api.use("/capture", captureRouter);

// agent action log at /agent/actions; agent-safe endpoints under /agent/*
api.use("/agent/actions", agentActionsRouter);
api.use("/agent", agentRouter);

app.use("/api/v1", api);

/* ---------- SPA fallback (React router) ---------- */

if (useReact) {
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(join(REACT_DIST, "index.html"));
  });
}

/* ---------- 404 + error handling ---------- */

app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, data: null, error: { code: "NOT_FOUND", message: "Unknown API route" } });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[key-of-solomon] error:", err);
  res.status(500).json({ success: false, data: null, error: { code: "INTERNAL_ERROR", message: err?.message || "Internal error" } });
});

app.listen(PORT, () => {
  const rowCount = (db.prepare("SELECT COUNT(*) n FROM tasks").get() as { n: number }).n;
  console.log(`
  ┌──────────────────────────────────────────────┐
  │   K E Y   O F   S O L O M O N                 │
  │   command center · agent-safe API · Beta 2   │
  └──────────────────────────────────────────────┘
`);
  console.log(`  Control Panel  →  http://localhost:${PORT}/app`);
  console.log(`  Live Dashboard →  http://localhost:${PORT}/dashboard`);
  console.log(`  Fast Capture   →  http://localhost:${PORT}/capture`);
  console.log(`  Agent Center   →  http://localhost:${PORT}/agent`);
  console.log(`  API base       →  http://localhost:${PORT}/api/v1`);
  console.log(`  Database       →  ${DB_PATH}`);
  console.log(`  Frontend       →  ${useReact ? "React (built)" : "Legacy HTML (run: cd frontend && npm run build)"}`);
  if (rowCount === 0) {
    console.log(`\n  Database is empty. Run 'npm run seed' for demo data.\n`);
  }
});
