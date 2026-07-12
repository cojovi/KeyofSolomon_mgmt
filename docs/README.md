# Key of Solomon — Beta 2

Key of Solomon is a **local-first task / project / idea command center** with two faces:

1. **Control Panel** (`/app`) — create, edit, search, filter, and manage everything.
2. **Live Dashboard** (`/dashboard`) — fullscreen, animated, read-only command-center view designed to run on a dedicated screen.
3. **Fast Capture** (`/capture`) — one-key drop zone for raw thoughts. AI classifies them automatically.

It also exposes a clean, documented REST API with a dedicated **agent-safe API** so a local AI agent (OpenClaw or similar) can create tasks, capture ideas, approve or reject pending actions, add progress notes, and log every move it makes.

## Quick start

```bash
cp .env.example .env          # set LOCAL_API_TOKEN
npm install
npm start
```

**`npm start` is enough for normal use.** A pre-built React UI ships in `frontend/dist/`, so you do not need a separate build step just to run the app.

Optional:

- `npm run seed` — load demo data (only if the database is empty)
- `npm run build:frontend` — recompile the UI after editing `frontend/src/`, or if startup reports `Frontend → Legacy HTML`

Then open:

| What | URL |
|---|---|
| Control Panel | http://localhost:8787/app |
| Live Dashboard | http://localhost:8787/dashboard |
| Fast Capture | http://localhost:8787/capture |
| Agent Center | http://localhost:8787/app/agent |
| API base | http://localhost:8787/api/v1 |
| Health check | http://localhost:8787/api/v1/health |

During development, run the backend and frontend separately:

```bash
npm run dev              # Express on :8787 (auto-restart on server changes)
npm run dev:frontend     # Vite on :5173 (HMR, proxies /api → :8787)
```

## Main features

- Projects, tasks, and ideas with full status lifecycles, priorities, tags, due dates
- One-level task hierarchy with main-task progress, collapsible subtasks, and guarded completion
- Fast Capture: type it, press Enter, AI classifies it and can break multi-step outcomes into subtasks
- Enforced AI ownership: embedded AI structures intake; Hermes executes and deliberately extends plans
- Agent Approval System: safe actions run immediately; destructive actions require user approval
- AI Summaries: 5 summary types (Today's Focus, What's Blocked, Week Progress, Ideas to Revisit, Agent Suggestions) via Anthropic, OpenAI, OpenRouter, or local Ollama
- Live dashboard: scrolling ticker, animated project cards, task grid, notes feed, agent avatar (4 states), AI summaries panel
- Agent Command Center: approve/reject pending actions, view agent state, generate summaries
- Realtime updates via Server-Sent Events
- Soft-delete everywhere — nothing important is hard-deleted

## Tech stack

- **Backend:** Node.js + Express + TypeScript (run with `tsx`, no compiled build step)
- **Frontend:** React 18 + Vite 6 + Tailwind CSS v3 + React Router v6 (built to `frontend/dist/`)
- **Database:** SQLite via `better-sqlite3` (single file at `./data/neondeck.db`, WAL mode)
- **AI:** Multi-provider client — Anthropic, OpenAI, OpenRouter, Ollama — configured in Settings
- **Realtime:** Server-Sent Events at `GET /api/v1/events`

The backend serves the compiled React SPA from `frontend/dist/` automatically — one process, one port. Re-run `npm run build:frontend` only after you change files under `frontend/src/`.

## Documentation map

| File | Contents |
|---|---|
| [LOCAL_SETUP.md](./LOCAL_SETUP.md) | Install, env vars, frontend build, kiosk mode |
| [HERMES_AGENT_BRIEF.md](./HERMES_AGENT_BRIEF.md) | Short agent operating brief for Hermes-compatible agents |
| [DATA_MODEL.md](./DATA_MODEL.md) | Every entity, field, and status (including Beta 2 additions) |
| [API.md](./API.md) | All standard REST endpoints |
| [AGENT_API.md](./AGENT_API.md) | The agent-safe API — **read this if you are an AI agent** |
| [STATUS_RULES.md](./STATUS_RULES.md) | Status meanings and transitions |
| [DASHBOARD.md](./DASHBOARD.md) | Dashboard zones, ticker rules, AI summaries, animation settings |
| [WEBHOOKS.md](./WEBHOOKS.md) | Inbound webhook endpoints |
| [EXAMPLES.md](./EXAMPLES.md) | Copy-paste curl examples for everything |

## Known limitations

- Single user, localhost-first. One shared bearer token.
- Attachments are links/file paths only; no binary file upload.
- No recurring tasks, reminders, or push notifications.
- Agent approval payloads are logged but agents cannot currently auto-execute approved actions — they receive the approval event via SSE and must re-call the endpoint.
