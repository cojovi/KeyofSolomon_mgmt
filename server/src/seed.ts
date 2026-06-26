/**
 * seed.ts — loads realistic demo data so the dashboard looks alive.
 * Usage:  npm run seed          (only seeds if database is empty)
 *         npm run seed:force    (wipes and reseeds)
 */
import "dotenv/config";
import { db } from "./db.js";
import { makeId, now } from "./helpers.js";

const force = process.argv.includes("--force");
const taskCount = (db.prepare("SELECT COUNT(*) n FROM tasks").get() as { n: number }).n;

if (taskCount > 0 && !force) {
  console.log("Database already has data. Use 'npm run seed:force' to wipe and reseed.");
  process.exit(0);
}

if (force) {
  for (const t of ["notes", "attachments", "agent_actions", "ideas", "tasks", "projects"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  console.log("Wiped existing data.");
}

const t = (offsetHours: number) => new Date(Date.now() + offsetHours * 3600_000).toISOString();
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400_000).toISOString();

/* ---------- projects ---------- */

const projects = [
  {
    id: makeId("proj"), title: "Build Task Dashboard App",
    shortDescription: "Key of Solomon itself — command center for tasks, projects, ideas, and agents.",
    longDescription: "Local-first task/project/idea system with a live animated dashboard for a dedicated screen, plus an agent-safe API for OpenClaw.",
    category: "coding", status: "active", priority: "high", progressPercent: 72,
    tags: JSON.stringify(["dashboard", "typescript", "sqlite"]),
    dueDate: day(14), createdAt: t(-240), updatedAt: t(-2), archivedAt: null,
  },
  {
    id: makeId("proj"), title: "OpenClaw Agent API",
    shortDescription: "Agent-safe endpoints so OpenClaw can create tasks, add notes, and log actions.",
    longDescription: "Covers context endpoints, task creation, status updates with mandatory reasons, and full action logging.",
    category: "coding", status: "active", priority: "urgent", progressPercent: 45,
    tags: JSON.stringify(["api", "agents", "openclaw"]),
    dueDate: day(7), createdAt: t(-200), updatedAt: t(-5), archivedAt: null,
  },
  {
    id: makeId("proj"), title: "Mini-Home Website",
    shortDescription: "Marketing site for the mini-home/container build business.",
    longDescription: "Landing page, pricing configurator, gallery, lead capture form.",
    category: "business", status: "blocked", priority: "high", progressPercent: 30,
    tags: JSON.stringify(["web", "marketing"]),
    dueDate: day(21), createdAt: t(-400), updatedAt: t(-30), archivedAt: null,
  },
  {
    id: makeId("proj"), title: "Home Automation Overhaul",
    shortDescription: "Consolidate Home Assistant automations, add presence detection.",
    category: "home", status: "planning", priority: "medium", progressPercent: 10,
    longDescription: null,
    tags: JSON.stringify(["home-assistant", "iot"]),
    dueDate: null, createdAt: t(-100), updatedAt: t(-48), archivedAt: null,
  },
  {
    id: makeId("proj"), title: "Garage 3D Print Farm",
    shortDescription: "Rack, power monitoring, and queue management for the printers.",
    category: "3d-printing", status: "paused", priority: "low", progressPercent: 55,
    longDescription: null,
    tags: JSON.stringify(["3d-printing", "hardware"]),
    dueDate: null, createdAt: t(-600), updatedAt: t(-150), archivedAt: null,
  },
];

const insertProject = db.prepare(
  `INSERT INTO projects (id, title, shortDescription, longDescription, category, status, priority, progressPercent, tags, dueDate, createdAt, updatedAt, archivedAt)
   VALUES (@id, @title, @shortDescription, @longDescription, @category, @status, @priority, @progressPercent, @tags, @dueDate, @createdAt, @updatedAt, @archivedAt)`
);
projects.forEach((p) => insertProject.run(p));

/* ---------- tasks ---------- */

const tasks = [
  {
    id: makeId("task"), title: "Finish API documentation",
    description: "Complete AGENT_API.md with workflows and examples.",
    area: "coding", status: "in_progress", priority: "urgent",
    dueDate: day(1), tags: JSON.stringify(["docs", "api"]), agentCandidate: 1,
    createdAt: t(-72), updatedAt: t(-1), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "Wire dashboard SSE refresh",
    description: "Dashboard should live-update when data changes.",
    area: "coding", status: "in_progress", priority: "high",
    dueDate: day(2), tags: JSON.stringify(["dashboard", "realtime"]), agentCandidate: 0,
    createdAt: t(-48), updatedAt: t(-3), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "Network closet cleanup",
    description: "Re-patch switch, label cables, replace flaky PoE injector.",
    area: "home", status: "todo", priority: "medium",
    dueDate: day(5), tags: JSON.stringify(["network", "home"]), agentCandidate: 0,
    createdAt: t(-120), updatedAt: t(-120), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "Mini-home pricing page copy",
    description: "Waiting on photography assets from the site visit.",
    area: "business", status: "blocked", priority: "high",
    dueDate: day(3), tags: JSON.stringify(["web", "copy"]), agentCandidate: 0,
    createdAt: t(-200), updatedAt: t(-20), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "Renew API key for weather service",
    description: "Blocked: waiting on confirmation email from provider.",
    area: "coding", status: "blocked", priority: "medium",
    dueDate: day(-1), tags: JSON.stringify(["api-key", "homeassistant"]), agentCandidate: 1,
    createdAt: t(-96), updatedAt: t(-10), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "File quarterly sales tax",
    description: null,
    area: "business", status: "todo", priority: "urgent",
    dueDate: day(2), tags: JSON.stringify(["finance"]), agentCandidate: 0,
    createdAt: t(-30), updatedAt: t(-30), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "Order PETG filament restock",
    description: "Black + neon green, 4 spools each.",
    area: "3d-printing", status: "waiting", priority: "low",
    dueDate: null, tags: JSON.stringify(["3d-printing", "supplies"]), agentCandidate: 1,
    createdAt: t(-80), updatedAt: t(-15), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "Backup Home Assistant config",
    description: "Snapshot to NAS + offsite copy.",
    area: "home", status: "todo", priority: "medium",
    dueDate: day(4), tags: JSON.stringify(["backup", "homeassistant"]), agentCandidate: 1,
    createdAt: t(-50), updatedAt: t(-50), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "Draft OpenClaw agent prompt",
    description: "System prompt for the local agent that will drive the agent API.",
    area: "coding", status: "todo", priority: "high",
    dueDate: day(6), tags: JSON.stringify(["agents", "openclaw"]), agentCandidate: 0,
    createdAt: t(-40), updatedAt: t(-40), completedAt: null, archivedAt: null,
  },
  {
    id: makeId("task"), title: "Set up kiosk mode on dashboard screen",
    description: "Old iPad or spare monitor + fullscreen Chrome.",
    area: "home", status: "done", priority: "medium",
    dueDate: day(-2), tags: JSON.stringify(["dashboard", "hardware"]), agentCandidate: 0,
    createdAt: t(-300), updatedAt: t(-24), completedAt: t(-24), archivedAt: null,
  },
];

const insertTask = db.prepare(
  `INSERT INTO tasks (id, title, description, area, status, priority, dueDate, tags, agentCandidate, createdAt, updatedAt, completedAt, archivedAt)
   VALUES (@id, @title, @description, @area, @status, @priority, @dueDate, @tags, @agentCandidate, @createdAt, @updatedAt, @completedAt, @archivedAt)`
);
tasks.forEach((x) => insertTask.run(x));

/* ---------- ideas ---------- */

const ideas = [
  {
    id: makeId("idea"), title: "Animated container configurator",
    body: "3D web configurator where customers drag modules onto a container floorplan and get live pricing.",
    category: "business", status: "reviewing", priority: "high",
    tags: JSON.stringify(["web", "3d", "sales"]),
    createdAt: t(-180), updatedAt: t(-12), convertedToType: null, convertedToId: null, archivedAt: null,
  },
  {
    id: makeId("idea"), title: "Voice-controlled garage workshop",
    body: "Wire shop lights, dust collection, and air filter into Home Assistant with voice scenes: 'shop mode', 'paint mode', 'closing time'.",
    category: "home", status: "captured", priority: "medium",
    tags: JSON.stringify(["home-assistant", "voice"]),
    createdAt: t(-90), updatedAt: t(-90), convertedToType: null, convertedToId: null, archivedAt: null,
  },
  {
    id: makeId("idea"), title: "3D print organizer wall",
    body: "Gridfinity-style wall panels for the workbench. Print in batches overnight, track spool usage per panel.",
    category: "3d-printing", status: "possible", priority: "medium",
    tags: JSON.stringify(["gridfinity", "organization"]),
    createdAt: t(-150), updatedAt: t(-60), convertedToType: null, convertedToId: null, archivedAt: null,
  },
  {
    id: makeId("idea"), title: "Agent that triages my inbox into tasks",
    body: "OpenClaw reads flagged emails and proposes tasks via the agent API with agentCandidate=true.",
    category: "coding", status: "reviewing", priority: "high",
    tags: JSON.stringify(["agents", "email", "automation"]),
    createdAt: t(-70), updatedAt: t(-8), convertedToType: null, convertedToId: null, archivedAt: null,
  },
  {
    id: makeId("idea"), title: "Dashboard ambient mode",
    body: "After 10pm, dashboard dims, slows animations, and only shows tomorrow's top 3.",
    category: "coding", status: "captured", priority: "low",
    tags: JSON.stringify(["dashboard", "ux"]),
    createdAt: t(-20), updatedAt: t(-20), convertedToType: null, convertedToId: null, archivedAt: null,
  },
];

const insertIdea = db.prepare(
  `INSERT INTO ideas (id, title, body, category, status, priority, tags, createdAt, updatedAt, convertedToType, convertedToId, archivedAt)
   VALUES (@id, @title, @body, @category, @status, @priority, @tags, @createdAt, @updatedAt, @convertedToType, @convertedToId, @archivedAt)`
);
ideas.forEach((x) => insertIdea.run(x));

/* ---------- notes ---------- */

const notes = [
  { parent: projects[0], parentType: "project", body: "Dashboard layout locked in: ticker top, projects left, tasks center, ideas + agent feed right.", type: "decision", createdBy: "user", at: t(-26) },
  { parent: projects[0], parentType: "project", body: "Progress 60% → 72%. API routes and seed data complete.", type: "progress", createdBy: "user", at: t(-2) },
  { parent: projects[1], parentType: "project", body: "Agent endpoints must require a reason for status changes — added to spec.", type: "decision", createdBy: "user", at: t(-30) },
  { parent: projects[1], parentType: "project", body: "OpenClaw test run hit the context/today endpoint successfully.", type: "agent_update", createdBy: "agent", at: t(-5) },
  { parent: projects[2], parentType: "project", body: "BLOCKER: photographer rescheduled, assets now expected Friday.", type: "blocker", createdBy: "user", at: t(-30) },
  { parent: tasks[0], parentType: "task", body: "EXAMPLES.md done, AGENT_API.md half drafted.", type: "progress", createdBy: "user", at: t(-1) },
  { parent: tasks[4], parentType: "task", body: "Provider support ticket #4821 opened.", type: "blocker", createdBy: "user", at: t(-10) },
  { parent: ideas[0], parentType: "idea", body: "Three.js or simple 2D SVG first? Start 2D, ship faster.", type: "note", createdBy: "user", at: t(-12) },
];

const insertNote = db.prepare(
  `INSERT INTO notes (id, parentType, parentId, body, type, createdBy, createdAt)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
notes.forEach((n) =>
  insertNote.run(makeId("note"), n.parentType, n.parent.id, n.body, n.type, n.createdBy, n.at)
);

/* ---------- attachments ---------- */

const insertAtt = db.prepare(
  `INSERT INTO attachments (id, parentType, parentId, label, url, filePath, type, createdAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
insertAtt.run(makeId("att"), "project", projects[0].id, "Styling reference", "https://dribbble.com/tags/cyberpunk-dashboard", null, "link", t(-100));
insertAtt.run(makeId("att"), "project", projects[2].id, "Site photos folder", null, "/Volumes/FastSSD/minihome/photos", "file", t(-90));
insertAtt.run(makeId("att"), "task", tasks[0].id, "API doc draft", null, "/docs/AGENT_API.md", "document", t(-40));

/* ---------- agent actions ---------- */

const insertAction = db.prepare(
  `INSERT INTO agent_actions (id, agentName, actionType, targetType, targetId, summary, details, createdAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
insertAction.run(makeId("act"), "OpenClaw", "dashboard_request", null, null, "Requested dashboard context", null, t(-6));
insertAction.run(makeId("act"), "OpenClaw", "add_note", "project", projects[1].id, "Added progress note to OpenClaw Agent API", "Verified context endpoint output shape", t(-5));
insertAction.run(makeId("act"), "OpenClaw", "create", "task", tasks[8].id, "Created task 'Draft OpenClaw agent prompt'", "Derived from inbox triage idea", t(-40));
insertAction.run(makeId("act"), "OpenClaw", "status_change", "task", tasks[6].id, "Task 'Order PETG filament restock': todo → waiting", "Order placed, awaiting shipment", t(-15));

console.log(`Seeded: ${projects.length} projects, ${tasks.length} tasks, ${ideas.length} ideas, ${notes.length} notes, 3 attachments, 4 agent actions.`);
