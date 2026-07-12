# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Key of Solomon** (package name `neondeck`) is a local-first, single-user task / project / idea command center with a live animated neon dashboard and an **agent-safe API**. It is designed to be operated by an AI agent as much as by a human. There is no cloud component; everything runs on `localhost` against a local SQLite file.

## Commands

```bash
npm start              # run the API + serve the built SPA (tsx, no build needed)
npm run dev            # same, but tsx watch (auto-restart on server changes)
npm run seed           # load demo data (only if DB is empty)
npm run seed:force     # wipe + reseed
npm run build:frontend # recompile the React SPA into frontend/dist (runs npm install in frontend/)

# Frontend dev with hot reload (proxies /api and /ui-config to :8787):
npm run dev:frontend   # vite dev server on :5173 — run `npm run dev` in another terminal too
```

`npm start` alone is enough for normal use: a pre-built SPA is committed to `frontend/dist/` and served directly. Only run `build:frontend` after editing `frontend/src/`, or if startup logs `Frontend → Legacy HTML` (meaning `frontend/dist/index.html` is missing and it fell back to `public/`).

There is **no test runner and no linter configured.** TypeScript is the only static check — the server uses `noEmit` (`tsconfig.json`), and the frontend build runs `tsc && vite build`, so a broken frontend type surfaces via `npm run build:frontend`.

Requires Node 20+. Default port is `8787` (see `.env`).

## Architecture

Two independent halves that only talk over HTTP:

- **Backend** — Express + `better-sqlite3`, all in `server/src/`, run directly via `tsx` (no compile step). Entry: `server/src/server.ts`.
- **Frontend** — React 18 + Vite + Tailwind + React Router, in `frontend/src/`, built to `frontend/dist/` (committed). `public/` is a legacy vanilla-HTML fallback used only if `dist/` is missing.

### Request flow (server.ts)

`express.static(frontend/dist)` serves the SPA with no auth. All data lives under `/api/v1`, which is wrapped by `authMiddleware` (bearer token). A catch-all `app.get("*")` returns `index.html` for client-side routing (anything not starting with `/api`).

### Two API surfaces over one datastore

This is the central design point. Both surfaces mutate the same tables through the **shared helpers in `server/src/store.ts`** (notes, attachments, soft-delete/`archiveEntity`, `logAgentAction`, `touchParent`) so behavior stays consistent:

1. **Standard REST** — `routes/projects.ts`, `tasks.ts`, `ideas.ts`, `misc.ts` (notes, attachments, settings, data import/export, webhooks, approvals, ai, capture), `dashboard.ts`. Full CRUD for the human UI.
2. **Agent-safe API** — `routes/agent.ts`, mounted at `/api/v1/agent`. Every endpoint validates input, **logs to `agent_actions`**, never hard-deletes, and **adds notes rather than overwriting user-written fields**. Reused CRUD internals are exported from the standard routes (e.g. `insertTask`/`patchTask` from `tasks.ts`, `convertIdea` from `ideas.ts`, `buildDashboardState` from `dashboard.ts`) and imported by `agent.ts`.

When adding an agent capability, wrap the standard route's exported helper — do not duplicate the SQL.

### Cross-cutting conventions

- **Response envelope**: everything returns `{ success, data, error }` via `ok()` / `fail()` in `helpers.ts`. The frontend `apiFetch` (in `frontend/src/lib/api.ts`) unwraps this and throws `APIError` on `success:false`.
- **Auth handoff**: the frontend has no hardcoded token. On load it calls `GET /ui-config` (localhost-only, defined in `server.ts`), which returns the live `LOCAL_API_TOKEN`, then sends it as `Authorization: Bearer`. In vite dev mode this is proxied through to `:8787`.
- **Live updates**: mutations call `broadcast("data-changed", …)` from `server/src/events.ts`, pushed to clients over SSE at `GET /api/v1/events`. The dashboard/control panel re-fetch on these events. Keepalive `ping` every 25s.
- **IDs & rows**: IDs are `prefix_<hex>` via `makeId()`. `tags` are stored as JSON strings and `agentCandidate` as 0/1 integer; `parseRow`/`parseRows` in `helpers.ts` deserialize them on the way out — always read rows through these.
- **Status/priority enums** are defined once in `helpers.ts` (`TASK_STATUSES`, `PROJECT_STATUSES`, `IDEA_STATUSES`, `PRIORITIES`, etc.) and validated with `oneOf()`. Add new values there.
- **Schema** is created idempotently on boot in `server/src/db.ts` (`CREATE TABLE IF NOT EXISTS`). There are no migrations — edit the schema there. Default settings are also seeded there.
- **AI is multi-provider and settings-driven** (`server/src/ai.ts`): provider/key/model are read fresh from the `settings` table on every `callAI` call (anthropic | openai | openrouter | ollama | none), so the user can switch providers from the UI without a restart. Default provider is `none`.

## Agent operating rules

If you are acting as the automation agent against this app's API (not editing its source), the behavioral contract lives in **`AGENTS.md`** and the docs. Key rules: prefer `/api/v1/agent/*`, send `X-Agent-Name`, never hard-delete (archive instead), add notes rather than rewriting user text, status changes require a `reason`, and use the approval flow (`/api/v1/approvals`) before gated actions (marking `done`, archiving, converting an idea, setting `urgent`, editing user-written titles/descriptions).

## Documentation

`docs/` is the source of truth and wins over any code comment when they conflict. Start with `docs/README.md`, `docs/HERMES_AGENT_BRIEF.md`, `docs/AGENT_API.md`, `docs/API.md`, `docs/DATA_MODEL.md`, and `docs/STATUS_RULES.md`. `CURSOR.md` is a longer companion guide covering the same ground with the design system and repository layout.
