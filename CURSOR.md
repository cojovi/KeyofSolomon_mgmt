# NEONDECK — Cursor Project Guide

> **What this is:** A local-first personal command center for projects, tasks, and ideas — with a neon-themed live dashboard, fast capture, AI summaries, and an agent-safe REST API designed for local AI assistants (e.g. OpenClaw).

**Display name:** **Key of Solomon** (shown in the UI, health endpoint, and startup banner)  
**Package / repo name:** `neondeck` (npm, database filename, env vars)  
**Version:** `0.2.0-beta.2` (Beta 2)  
**Default port:** `8787`

---

## Purpose

NEONDECK / Key of Solomon is a single-user, localhost-first productivity hub. It replaces scattered notes, todo apps, and project trackers with one SQLite-backed system that has three main surfaces:

| Surface | Route | Role |
|---|---|---|
| **Control Panel** | `/app` | Full CRUD UI — projects, tasks, ideas, activity, agent center, settings |
| **Live Dashboard** | `/dashboard` | Fullscreen, animated, read-only command-center view (kiosk-friendly) |
| **Fast Capture** | `/capture` | Minimal one-key drop zone; AI classifies input into task/idea/project/note |

A fourth concern is the **Agent API** (`/api/v1/agent/*`) — a validated, logged, non-destructive API layer so AI agents can manage the user's workspace without hard-deleting data or silently overwriting user content.

### Quick URLs (after `npm start`)

| What | URL |
|---|---|
| Control Panel | http://localhost:8787/app |
| Live Dashboard | http://localhost:8787/dashboard |
| Fast Capture | http://localhost:8787/capture |
| Agent Center | http://localhost:8787/app/agent |
| API base | http://localhost:8787/api/v1 |
| Health check | http://localhost:8787/api/v1/health |
| UI token handoff | http://localhost:8787/ui-config (localhost only) |

---

## Beta 2 Features (current release)

Beyond core CRUD, Beta 2 adds:

| Feature | Where | Summary |
|---|---|---|
| **React Control Panel** | `frontend/src/` | Full SPA replacing legacy vanilla HTML in `public/app/` |
| **Fast Capture + AI classify** | `/capture`, `POST /api/v1/capture` | Raw text → AI picks task / idea / project / note; toggle via `captureAutoClassify` setting |
| **Agent Approval System** | `/app/agent`, `POST /api/v1/approvals/*` | Destructive agent actions queue for user approve/reject before execution |
| **AI Summaries** | Agent Center + Dashboard AI panel, `GET/POST /api/v1/ai/summaries` | Five cached summary types (see below); multi-provider |
| **Agent candidate flag** | Tasks UI + `tasks.agentCandidate` | User marks tasks as good candidates for agent work |
| **Inbound webhooks** | `POST /api/v1/webhooks/*` | External tools (Shortcuts, n8n, Zapier) push tasks, ideas, notes, agent updates |
| **Export / import** | `GET/POST /api/v1/data` | Full JSON backup and restore |
| **SSE realtime** | `GET /api/v1/events` | All UIs refresh on `data-changed` broadcasts |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript (run via `tsx`, no server build step) |
| Frontend | React 18, Vite 6, Tailwind CSS v3, React Router v6, Lucide icons |
| Database | SQLite via `better-sqlite3` at `./data/neondeck.db` (WAL mode; falls back to DELETE journal on unsupported FS) |
| Realtime | Server-Sent Events at `GET /api/v1/events` |
| AI | Multi-provider client in `server/src/ai.ts` — Anthropic, OpenAI, OpenRouter, Ollama |

The Express server serves the compiled React SPA from `frontend/dist/`. If that folder is missing, it falls back to legacy vanilla HTML in `public/`.

---

## UI & Design System

The product uses a **neon cyber command-center** aesthetic — dark backgrounds, cyan/magenta accents, glow effects, and display fonts sized for kiosk reading on the live dashboard.

| Concern | Location |
|---|---|
| Tailwind tokens (colors, fonts, animations) | `frontend/tailwind.config.js` |
| Global styles, utility classes (`.card`, `.btn-ghost`, `.zone-title`) | `frontend/src/index.css` |
| Google Fonts | Loaded in `frontend/index.html` — Chakra Petch (display), Rajdhani (body), Share Tech Mono (mono), Caveat (hand) |
| Control panel shell | `AppLayout` → `Sidebar` + `QuickAdd` bar + page `Outlet` |
| Toast notifications | `frontend/src/components/ui/Toast.tsx` |
| Live dashboard | `frontend/src/pages/Dashboard.tsx` — fullscreen, no sidebar, independent scroll zones |

Key palette tokens: `bg`, `panel`, `cyan` (#00f0ff), `pink`, `lime`, `nred`, `line` (subtle cyan borders).

---

## Repository Layout

```
neondeck/                     <!-- was neondeck_mgmt/ during early development -->
├── CURSOR.md                 ← this file
├── README.md                 ← quick start
├── package.json              ← root scripts, server deps
├── tsconfig.json             ← server TypeScript config
├── .env.example              ← PORT, LOCAL_API_TOKEN, DATABASE_PATH
├── .gitignore                ← ignores node_modules/, data/, .env
│
├── server/src/
│   ├── server.ts             ← Express app entry, static UI, SSE, route mounting
│   ├── db.ts                 ← SQLite schema, settings defaults
│   ├── helpers.ts            ← API envelope, auth, validation, serialization
│   ├── store.ts              ← shared data access (notes, attachments, logging, archive)
│   ├── events.ts             ← SSE broadcast hub
│   ├── ai.ts                 ← multi-provider AI client + capture classification + summaries
│   ├── seed.ts               ← demo data loader (npm run seed / seed:force)
│   └── routes/
│       ├── projects.ts       ← project CRUD
│       ├── tasks.ts          ← task CRUD
│       ├── ideas.ts          ← idea CRUD + conversion
│       ├── dashboard.ts      ← GET /dashboard/state builder
│       ├── agent.ts          ← agent-safe API (validated, logged, no deletes)
│       └── misc.ts           ← notes, attachments, settings, export/import,
│                               webhooks, approvals, AI summaries, capture
│
├── frontend/
│   ├── package.json          ← React/Vite deps (separate from root)
│   ├── src/
│   │   ├── App.tsx           ← React Router routes
│   │   ├── main.tsx          ← entry (Toast provider, config init)
│   │   ├── lib/
│   │   │   ├── api.ts        ← fetch wrapper, SSE client, ui-config token handoff
│   │   │   ├── types.ts      ← shared TypeScript types (mirror server entities)
│   │   │   └── utils.ts      ← formatting helpers (relativeTime, etc.)
│   │   ├── pages/            ← Overview, Projects, Tasks, Ideas, Activity,
│   │   │                       AgentCenter, SettingsPage, Dashboard, Capture
│   │   └── components/
│   │       ├── layout/       ← AppLayout, Sidebar
│   │       ├── ui/           ← Badge, Modal, Toast, ProgressBar
│   │       └── QuickAdd.tsx  ← persistent task/idea quick-add bar in control panel
│   ├── dist/                 ← built SPA (served by Express when present)
│   ├── vite.config.ts        ← dev proxy /api → :8787
│   └── tailwind.config.js    ← design tokens
│
├── public/                   ← legacy vanilla HTML fallback (used when frontend/dist missing)
│   ├── app/index.html
│   └── dashboard/index.html
│
├── docs/                     ← full markdown documentation
│   ├── README.md             ← feature overview + doc map
│   ├── LOCAL_SETUP.md
│   ├── DATA_MODEL.md
│   ├── API.md
│   ├── AGENT_API.md          ← **read this if you are an AI agent**
│   ├── STATUS_RULES.md
│   ├── DASHBOARD.md
│   ├── WEBHOOKS.md
│   └── EXAMPLES.md
│
├── notes/                    ← dev scratch only (build prompts, styling refs, screenshots)
│                               NOT part of runtime; safe to ignore for code changes
│
└── data/                     ← SQLite DB (gitignored, created at runtime)
```

---

## Core Data Model

All entities use prefixed string IDs (`proj_`, `task_`, `idea_`, `note_`, `att_`, `act_`, `appr_`, `asum_`), ISO-8601 timestamps, and JSON-array tags stored as text. **Soft delete everywhere** for projects, tasks, and ideas — archive via `status: "archived"` + `archivedAt`; nothing important is hard-deleted.

| Entity | Prefix | Key statuses |
|---|---|---|
| **Project** | `proj_` | planning, active, paused, blocked, completed, archived |
| **Task** | `task_` | todo, in_progress, waiting, blocked, done, archived — also has `agentCandidate` (see below) |
| **Idea** | `idea_` | captured, reviewing, possible, converted, archived |
| **Note** | `note_` | Attached to project/task/idea; types: note, progress, decision, blocker, agent_update |
| **Attachment** | `att_` | Links or file paths (no binary upload); parent can be project, task, idea, or note |
| **AgentAction** | `act_` | Audit log of agent activity |
| **AgentApproval** | `appr_` | Pending/approved/rejected destructive-action requests |
| **AISummary** | `asum_` | Cached AI-generated summaries (5 types) |

See [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) for full field definitions.

---

## API Conventions

- **Base URL:** `http://localhost:8787/api/v1`
- **Auth:** `Authorization: Bearer <LOCAL_API_TOKEN>` on all routes except `/health`
- **Response envelope:** `{ success: bool, data: T | null, error: { code, message } | null }`
- **UI token handoff:** `GET /ui-config` (localhost only) returns `{ apiBase, token }` for the React frontend
- **Agent identity:** `X-Agent-Name: <name>` header on agent endpoints
- **Realtime:** SSE events `connected`, `data-changed`, `ping` (25s keepalive)

### Route groups

| Prefix | File | Purpose |
|---|---|---|
| `/projects`, `/tasks`, `/ideas` | `routes/*.ts` | Standard CRUD + notes/attachments |
| `/notes`, `/attachments` | `misc.ts` | Cross-entity notes and attachments |
| `/settings`, `/data` | `misc.ts` | App settings, JSON export/import |
| `/dashboard` | `dashboard.ts` | Aggregated dashboard state (`/state` + alias `/`) |
| `/webhooks` | `misc.ts` | Inbound webhook endpoints (task, idea, note, agent-update) |
| `/approvals`, `/ai`, `/capture` | `misc.ts` | Agent approvals, AI summaries, fast capture |
| `/agent/actions` | `misc.ts` | Agent action log (read) |
| `/agent/*` | `agent.ts` | Agent-safe write/read endpoints |

### AI summary types

Cached in `ai_summaries`; generated via `POST /api/v1/ai/summaries/generate`:

| Key | Purpose |
|---|---|
| `today_focus` | What to prioritize today |
| `whats_blocked` | Blockers across projects and tasks |
| `week_progress` | Progress recap for the week |
| `ideas_revisit` | Ideas worth revisiting |
| `agent_suggest` | Suggestions for agent-assisted work |

---

## Agent Integration (Important for AI Assistants)

If you are a Cursor agent working **on behalf of the user to manage their NEONDECK data**, use the agent API — not raw DELETE endpoints.

**Safe actions (no approval):** create tasks/ideas/notes, add progress updates, set status to in_progress/waiting/blocked, log actions.

**Requires user approval:** mark done, archive, convert idea→project, set urgent, modify user-written titles/descriptions.

**Hard rules:**
- Never hard-delete anything
- Always supply a `reason` when changing task status
- Prefer adding notes over overwriting user content
- Every action is logged to `agent_actions`
- Read [`docs/AGENT_API.md`](./docs/AGENT_API.md) before making agent calls

### Agent approval workflow

1. Agent calls a gated endpoint → server creates `agent_approvals` row with `status: pending`
2. User sees pending items in **Agent Center** (`/app/agent`)
3. User approves or rejects via `POST /api/v1/approvals/:id/approve` or `/reject`
4. SSE broadcasts the resolution; agent must re-call the original action after approval (no auto-execution)

### Agent candidate checkbox (Control Panel)

When creating or editing a task in the Control Panel (`/app/tasks`), the **Agent candidate** checkbox (robot icon) sets the task field `agentCandidate: boolean` on the `Task` entity. It is **not** auto-delegation — it is a user-facing flag that says “this task is a good candidate for an AI agent to work on.”

| When checked (`agentCandidate: true`) | When unchecked (default) |
|---|---|
| Task appears in agent priority lists and daily context | Task is a normal personal to-do |
| Sorted first in `GET /agent/tasks/available` | Agents still see it, but lower priority |
| Included in `GET /agent/context/today` → `agentCandidates` | Not surfaced as agent work |
| Shows an agent badge in Tasks, Dashboard, and Agent Center | No agent badge |

**What it does:**
- Signals intent to connected agents (OpenClaw, Cursor, etc.) that the user wants help with this task
- Surfaces the task in Agent Center (`frontend/src/pages/AgentCenter.tsx`) and the live dashboard
- Lets agents filter tasks via `GET /tasks?agentCandidate=true`

**What it does NOT do:**
- Does not automatically assign the task to any agent
- Does not start agent work or change task status
- Does not bypass the approval system for destructive actions (mark done, archive, etc.)

**When to check it:** research, drafting, API/automation work, docs — anything an agent could realistically help with.

**When to leave it unchecked:** personal errands, in-person tasks, or anything only the user can do (e.g. paying a ticket, picking up mail).

**UI implementation:** `frontend/src/pages/Tasks.tsx` (New Task / Edit Task modal).  
**Storage:** `tasks.agentCandidate` column in SQLite (`server/src/db.ts`, integer 0/1).  
**Agent reads:** `server/src/routes/agent.ts` (`/context/today`, `/tasks/available`).

---

## Frontend Routes

| Path | Component | Notes |
|---|---|---|
| `/` | redirect → `/app` | |
| `/app` | Overview | Control panel home — stat cards, today's focus, recent activity |
| `/app/projects` | Projects | |
| `/app/tasks` | Tasks | Filter by status; agent candidate checkbox |
| `/app/ideas` | Ideas | Convert to task/project |
| `/app/activity` | Activity | Agent action log |
| `/app/agent` | AgentCenter | Approve/reject pending actions; generate AI summaries; agent avatar |
| `/app/settings` | SettingsPage | AI provider, dashboard prefs |
| `/dashboard` | Dashboard | Fullscreen live view, no sidebar |
| `/capture` | Capture | Fast capture with AI classification |

Frontend API client: `frontend/src/lib/api.ts` — auto-fetches token from `/ui-config`, connects SSE for live updates.

---

## Development Commands

```bash
cp .env.example .env          # set LOCAL_API_TOKEN
npm install
npm start                     # Express on :8787 — pre-built UI in frontend/dist/
```

Optional: `npm run seed` (demo data) · `npm run build:frontend` (after editing `frontend/src/` or if dist is missing)

**Dev mode (two terminals):**

```bash
npm run dev              # backend with auto-restart
npm run dev:frontend     # Vite on :5173, proxies /api → :8787
```

**Other scripts:**

| Script | Action |
|---|---|
| `npm run seed:force` | Wipe entity tables and re-seed demo data |
| `npm run build` | Alias for `build:frontend` |

---

## Key Patterns When Editing Code

1. **Mutations broadcast SSE** — after DB writes, call `broadcast("data-changed", { entity, id })` from `events.ts`.
2. **Validation lives in `helpers.ts`** — use `requireString`, `oneOf`, `ValidationError`; respond via `ok()` / `fail()`.
3. **Shared DB logic in `store.ts`** — `createNote`, `logAgentAction`, `getEntity`, archive helpers.
4. **Row parsing** — SQLite stores tags as JSON strings; `parseRows` / `parseRow` in helpers deserialize them.
5. **AI is optional** — `aiProvider: "none"` is valid; `callAI` throws `AIError("NOT_CONFIGURED")` when unset.
6. **Frontend types** — mirror server entities in `frontend/src/lib/types.ts`; keep in sync when adding fields.
7. **Route inserts** — new API routes go in `server/src/routes/`, mounted in `server.ts` under `/api/v1`; new UI pages need a route in `App.tsx` and optionally a sidebar link in `Sidebar.tsx`.

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP listen port |
| `LOCAL_API_TOKEN` | (required) | Bearer token for all API auth |
| `DATABASE_PATH` | `./data/neondeck.db` | SQLite file location |

AI provider settings and dashboard prefs are stored in the SQLite `settings` table, not in `.env`:

| Setting key | Default | Purpose |
|---|---|---|
| `aiProvider` | `none` | anthropic \| openai \| openrouter \| ollama \| none |
| `aiApiKey` | `""` | Provider API key |
| `aiModel` | `""` | Model override (falls back to provider defaults in `ai.ts`) |
| `aiBaseUrl` | `""` | Base URL override (needed for Ollama / custom endpoints) |
| `captureAutoClassify` | `true` | Auto-classify Fast Capture input via AI |
| `dashboardRefreshSeconds` | `30` | Live dashboard poll interval |
| `animationSpeed` | `1` | Dashboard animation multiplier |
| `reducedMotion` | `false` | Disable heavy animations |
| `defaultDashboardMode` | `full` | Dashboard display mode |

---

## Webhooks (inbound)

External tools can push data without using the full agent API. All require the same bearer token. See [`docs/WEBHOOKS.md`](./docs/WEBHOOKS.md).

| Endpoint | Creates |
|---|---|
| `POST /webhooks/task` | Task (+ optional system note with `source`) |
| `POST /webhooks/idea` | Idea |
| `POST /webhooks/note` | Note on existing parent |
| `POST /webhooks/agent-update` | Agent action log entry + SSE broadcast |

<!-- Outbound webhooks (Key of Solomon POSTs to your URL on events) are planned but NOT implemented yet. -->

---

## Known Limitations

- Single user, one shared bearer token, localhost-first
- Attachments are URLs/file paths only — no binary upload
- No recurring tasks, reminders, or push notifications
- Approved agent actions are logged but agents must re-call endpoints after approval (no auto-execution)
- Notes can be hard-deleted via `DELETE /notes/:id` (user-initiated only; agents should not use this)
- Outbound webhooks not yet implemented

---

## Where to Look First

| Task | Start here |
|---|---|
| Add a new API endpoint | `server/src/routes/` + mount in `server.ts` |
| Change DB schema | `server/src/db.ts` (add migration-style `ALTER` if needed) |
| Add a UI page | `frontend/src/pages/` + route in `App.tsx` + sidebar in `Sidebar.tsx` |
| Agent behavior | `server/src/routes/agent.ts`, `docs/AGENT_API.md` |
| Dashboard data shape | `server/src/routes/dashboard.ts`, `frontend/src/pages/Dashboard.tsx` |
| AI features | `server/src/ai.ts`, capture/approval routes in `misc.ts` |
| Styling / theme | `frontend/tailwind.config.js`, `frontend/src/index.css` |
| Full API reference | `docs/API.md`, `docs/EXAMPLES.md` |
| Kiosk / dedicated display setup | `docs/LOCAL_SETUP.md`, `docs/DASHBOARD.md` |

---

## Documentation Index

Detailed docs live in [`docs/`](./docs/README.md). Prefer those for endpoint signatures, curl examples, dashboard zone rules, and webhook payloads. This file is a Cursor-oriented overview — not a substitute for the full API docs.

