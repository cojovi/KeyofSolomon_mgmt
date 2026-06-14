# Live Dashboard

Route: `http://localhost:8787/dashboard` — fullscreen, read-only, designed for a dedicated screen. See LOCAL_SETUP.md for kiosk mode.

## Layout zones

```
┌──────────────────────────────────────────────────────────────────────┐
│ STATUS BAR: NEONDECK · refresh status · task/project/idea counts     │
│             pending approvals · fast capture link                    │
├──────────────────────────────────────────────────────────────────────┤
│ SCROLLING TICKER: blocked / due-soon / agent / updated items         │
├─────────────────┬────────────────────────────┬───────────────────────┤
│ LEFT            │ CENTER                     │ RIGHT                 │
│ ACTIVE PROJECTS │ TASKS (2-column grid)      │ AGENT STATUS + avatar │
│ animated cards  │   In Progress · Blocked    │ + recent agent actions│
│ with progress   │   Todo · Due Soon          ├───────────────────────┤
│ bars + status   │   Waiting                  │ IDEAS (mini list)     │
│                 ├────────────────────────────┤                       │
│                 │ RECENT ACTIVITY feed       ├───────────────────────┤
│                 │ color-coded by type        │ AI INSIGHT panel      │
│                 │                            │ (rotating summaries)  │
└─────────────────┴────────────────────────────┴───────────────────────┘
│ BOTTOM BAR: version · fast capture · agent center · refresh cadence  │
└──────────────────────────────────────────────────────────────────────┘
```

## Data source

Everything comes from one call: `GET /api/v1/dashboard/state` (the bare `GET /api/v1/dashboard` is kept as a backward-compatible alias returning the same payload).

```json
{
  "generatedAt": "2026-06-13T12:00:00.000Z",
  "summary": { "activeProjects": 4, "openTasks": 12, "blockedItems": 2, "ideas": 18 },
  "ticker": [ { "type": "blocked", "label": "BLOCKED", "text": "Finish API docs", "targetType": "task", "targetId": "task_…" } ],
  "projects": [ Project ],
  "tasks": { "inProgress": [], "todo": [], "waiting": [], "blocked": [], "dueSoon": [] },
  "ideas": [ Idea ],
  "recentNotes": [ Note ],
  "agentActions": [ AgentAction ]
}
```

AI summaries are fetched separately via `GET /api/v1/ai/summaries` and displayed in the AI Insight panel.

## Item selection rules

- **projects** — statuses `planning/active/paused/blocked`; blocked first, then active, then recency. Max 12, top 5 in viewport.
- **tasks.dueSoon** — open tasks due within 3 days, soonest first.
- **tasks.*** — capped at 8 per group, 5 rendered per block.
- **ideas** — not archived/converted; newest-updated first; max 12.
- **recentNotes** — newest 15 across all parent types.
- **agentActions** — newest 20 for the agent feed; most recent 3 in the agent panel.
- **ticker** (priority order): blocked tasks → overdue tasks → blocked projects → due-soon tasks → high-priority ideas → recent agent actions → recently-updated items. Duplicated for seamless infinite scroll.

## Live updates

1. **SSE** — subscribes to `GET /api/v1/events`. The server emits a single `data-changed` event on every mutation, so the dashboard refetches on `data-changed` (and on the granular `project_updated` / `task_updated` / `idea_updated` / `agent_action` names, kept for forward-compatibility). Keepalive `ping` and `connected` events are ignored.
2. **Polling fallback** — every `dashboardRefreshSeconds` (default 30s). This always runs, so the dashboard stays current even if SSE drops.

Pending approvals counter in the status bar increments in real time on `approval_requested` SSE events.

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
