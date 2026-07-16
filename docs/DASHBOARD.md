# Live Dashboard

Route: `http://localhost:8787/dashboard` — fullscreen and mutation-free,
designed for a dedicated screen. Entity-backed rows are navigable into the
control panel; the dashboard itself never changes task data. See LOCAL_SETUP.md
for kiosk mode.

## Layout zones

```
┌────────────────────────────────────────────────────────────────────────────┐
│ HEADER: Key of Solomon · live clock · sync status │ 6 KPI tiles:                   │
│   PROJECTS · OPEN TASKS · DUE TODAY · OVERDUE · BLOCKED · IDEAS             │
├────────────────────────────────────────────────────────────────────────────┤
│ SCROLLING TICKER: urgent / overdue / blocked / agent / idea / updated       │
├─────────────────┬──────────────────────────────────┬─────────────────────────┤
│ LEFT            │ CENTER — TASK COMMAND BOARD       │ RIGHT                   │
│ ACTIVE PROJECTS │ 6 status columns (3 × 2):         │ GORDON / OPENCLAW       │
│  icon·progress· │   In Progress · Due Today ·       │  avatar · state ·       │
│  status · due   │   Blocked / To Do · Waiting ·     │  recent actions         │
├─────────────────┤ main-task rail + Done Today       ├─────────────────────────┤
│ RECENT ACTIVITY │ each column shows a count and     │ UPCOMING DEADLINES      │
│  color-coded by │ scrolls independently             │ IDEAS (mini list)       │
│  note type      │                                   │ AI INSIGHT              │
└─────────────────┴──────────────────────────────────┴─────────────────────────┘
│ FOOTER: version · fast capture · agent center · control panel · cadence     │
└────────────────────────────────────────────────────────────────────────────┘
```

Text is sized for at-a-glance reading on a wall display, and every region
scrolls independently inside a fixed full-screen frame (no page-level scroll).
Task titles and right-rail content use responsive 15–16px display text with
12–13px metadata so the board stays readable without expanding row density.

## Navigation

Tasks, projects, ideas, deadlines, activity entries, ticker entries, and Gordon
actions with entity references link to stable control-panel detail routes:

- `/app/tasks/:taskId`
- `/app/projects/:projectId`
- `/app/ideas/:ideaId`

KPI tiles and command-board column headers open URL-driven filtered lists.
These are normal links with keyboard focus behavior and work after refresh or
bookmarking.

## Data source

Everything comes from one call: `GET /api/v1/dashboard/state` (the bare `GET /api/v1/dashboard` is kept as a backward-compatible alias returning the same payload).

```json
{
  "generatedAt": "2026-06-13T12:00:00.000Z",
  "summary": { "activeProjects": 4, "openTasks": 12, "blockedItems": 2, "ideas": 18, "dueToday": 3, "overdue": 1, "completedToday": 5 },
  "ticker": [ { "type": "blocked", "label": "BLOCKED", "text": "Finish API docs", "targetType": "task", "targetId": "task_…" } ],
  "projects": [ Project ],
  "tasks": { "inProgress": [], "todo": [], "waiting": [], "blocked": [], "dueSoon": [], "dueToday": [], "completedToday": [] },
  "ideas": [ Idea ],
  "recentNotes": [ Note ],
  "agentActions": [ AgentAction ],
  "upcomingDeadlines": [ { "id": "task_…", "title": "File quarterly sales tax", "dueDate": "2026-06-15T…", "priority": "urgent", "status": "todo", "kind": "task" } ]
}
```

AI summaries are fetched separately via `GET /api/v1/ai/summaries` and displayed in the AI Insight panel.

## Item selection rules

- **projects** — statuses `planning/active/paused/blocked`; blocked first, then active, then recency. Max 12.
- **tasks.dueToday** — open tasks whose due date is today (priority order). Powers the Due Today column + KPI.
- **tasks.completedToday** — tasks marked done today (newest first). Powers the Done Today column + KPI.
- **tasks.dueSoon** — open tasks due within 3 days, soonest first.
- **main-task rail** — deduplicated open top-level tasks only. Subtasks stay in
  their status columns and use a branch marker; main tasks show completed/total
  subtask progress.
- **tasks.\*** — capped at 8 per group, 6 rendered per column (with "+N more").
- **summary.dueToday / overdue / completedToday** — counts for the header KPI tiles (Overdue = open tasks past their due date).
- **upcomingDeadlines** — tasks + projects with a due date in the next 7 days (and any overdue), soonest first, max 10. Powers the Upcoming Deadlines panel.
- **ideas** — not archived/converted; newest-updated first; max 12.
- **recentNotes** — newest 15 across all parent types.
- **agentActions** — newest 15 for the agent feed; most recent 3 in the agent panel.
- **ticker** (priority order): urgent/blocked tasks → overdue tasks → blocked projects → due-soon tasks → high-priority ideas → recent agent actions → recently-updated items. Duplicated for seamless infinite scroll.

## Live updates

1. **SSE** — subscribes to `GET /api/v1/events`. The server emits a single `data-changed` event on every mutation, so the dashboard refetches on `data-changed` (and on the granular `project_updated` / `task_updated` / `idea_updated` / `agent_action` names, kept for forward-compatibility). Keepalive `ping` and `connected` events are ignored.
2. **Polling fallback** — every `dashboardRefreshSeconds` (default 30s). This always runs, so the dashboard stays current even if SSE drops.

Pending approvals counter in the status bar increments in real time on `approval_requested` SSE events.

`notification_created` events drive the global in-app pop-up stack and the
dashboard notification bell. Gordon task completions, blockers, approval
requests, terminal integration failures, and chat replies are persisted until
read. Optional browser notifications run only while a Key of Solomon tab is
open and hidden.

## Animation settings

| Setting | Effect |
|---|---|
| `animationSpeed` | Multiplies all animations |
| `reducedMotion` | `true` disables ALL animation (ticker stops, avatar stops spinning) — dashboard stays readable |
| `dashboardRefreshSeconds` | Polling fallback cadence |

Set in Control Panel → Settings (`/app/settings`).

## Agent avatar states

| State | Color | Trigger |
|---|---|---|
| IDLE | grey-blue | No recent agent action |
| WORKING | cyan | Last agent action within 5 minutes |
| NEEDS ATTENTION | amber + ping | One or more pending approvals |
| ERROR | red + ping | Most recent action has `actionType: "error"` |

The avatar also shows a numbered badge when there are pending approvals.

## AI Insight panel

Displays the most recently generated AI summaries (requires AI provider configured in Settings). Tabs cycle between available summary types:

- **Today's Focus** — what to work on today
- **What's Blocked** — blockers and how to unblock them
- **Week Progress** — what moved this week
- **Ideas to Revisit** — ideas worth reconsidering
- **Agent Suggestions** — what the agent recommends

Generate summaries from the Agent Center (`/app/agent`) or via `POST /api/v1/ai/summaries/:type`.
