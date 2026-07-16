# Key of Solomon / Neondeck — AGENTS.md

## Purpose

This repo is **Key of Solomon** (formerly **Neondeck**): a local-first task / project / idea command center designed to be operated by an AI agent as much as by a human.

Treat the docs as the source of truth. If anything here conflicts with `docs/*`, the docs win.

## Canonical docs

Read these first when working in this repo:

- `docs/GORDON_OPENCLAW_AGENT_BRIEF.md`
- `docs/README.md`
- `docs/AGENT_API.md`
- `docs/API.md`
- `docs/DATA_MODEL.md`
- `docs/STATUS_RULES.md`
- `docs/WEBHOOKS.md`
- `docs/DASHBOARD.md`
- `docs/LOCAL_SETUP.md`
- `docs/EXAMPLES.md`

## Core agent rules

- Prefer the **agent-safe API** under `/api/v1/agent` whenever possible.
- Use `X-Agent-Name` on agent requests.
- **Never hard-delete** anything. Use archive / soft-delete behavior instead.
- Prefer **adding notes** over rewriting user-written titles, descriptions, or bodies.
- Changing task status requires a **reason**.
- Before creating new work, check `/api/v1/agent/tasks/available` to avoid duplicates.
- For anything that could be destructive or user-visible in a bad way, use the approval flow first.
- Log work done outside the agent API with `/api/v1/agent/actions/log` so the dashboard stays accurate.

## Approval-gated actions

Request approval first before:

- marking a task `done` unless explicitly instructed in the current session
- archiving anything
- converting an idea to a project
- setting a task to `urgent`
- modifying a user-written title or description

## Safe actions

Proceed directly for:

- creating tasks, ideas, and notes
- adding progress updates
- changing task status to `in_progress`, `waiting`, or `blocked`
- logging agent actions

## Recommended agent workflow

1. Read `docs/GORDON_OPENCLAW_AGENT_BRIEF.md` plus any relevant docs.
2. Inspect current state via `/api/v1/agent/context/today` or `/api/v1/agent/tasks/available`.
3. Batch any independent reads before acting.
4. Pick the smallest safe action that moves the work forward.
5. Use the agent-safe endpoint.
6. Add notes instead of overwriting user text when unsure.
7. Use the approval system before any gated action.
8. Never permanently delete data.
9. Log work that happens outside the API.
10. Keep iterating until the task is done or blocked.

## Useful routes

- Control Panel: `/app`
- Live Dashboard: `/dashboard`
- Fast Capture: `/capture`
- Agent Center: `/app/agent`
- API base: `/api/v1`
- SSE stream: `/api/v1/events`

## Local setup

- Node.js 20+ recommended
- `npm start` is the normal run command
- `npm run dev` runs the API with watch
- `npm run dev:frontend` runs the frontend dev server
- `npm run build:frontend` rebuilds the bundled frontend

## Implementation notes

- SQLite is the datastore.
- The app is local-first and single-user.
- Soft delete is the standard pattern.
- The dashboard is read-only.
- The agent API is there to make the system safe for automation, not to make the agent feel clever.

## If you are the agent

Do the work, be concise, don’t mutate user-written content unless asked, and if the action smells destructive, stop and use approvals. The project does not need a robot with a chainsaw.
