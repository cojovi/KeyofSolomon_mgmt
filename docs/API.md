# Standard REST API

Base URL (default): `http://localhost:8787/api/v1`

## Conventions

**Auth** — every endpoint except `GET /health` requires:

```
Authorization: Bearer <LOCAL_API_TOKEN>
```

(`LOCAL_API_TOKEN` is set in `.env`. SSE connections may pass `?token=` instead, since EventSource cannot set headers.)

**Response envelope** — every response is JSON:

```json
{ "success": true,  "data": { ... }, "error": null }
{ "success": false, "data": null,    "error": { "code": "VALIDATION_ERROR", "message": "…" } }
```

**Error codes:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `FORBIDDEN` (403), `INTERNAL_ERROR` (500).

**Deletes are soft.** `DELETE` on projects/tasks/ideas archives the record. Only notes and attachments hard-delete.

**Tags** may be sent as an array (`["a","b"]`) or comma string (`"a, b"`).

---

## Health

`GET /health` — no auth required.

```json
{ "data": { "status": "ok", "app": "Key of Solomon", "version": "0.2.0-beta.2", "time": "…", "database": "…", "frontend": "react" } }
```

## Realtime events

`GET /events?token=<token>` — Server-Sent Events stream.

| Event | Fired when |
|---|---|
| `connected` | on connect |
| `data-changed` | any entity created/updated/archived. Payload: `{entity, id, op, by?}` |
| `project_updated` | a project changes |
| `task_updated` | a task changes |
| `idea_updated` | an idea changes |
| `agent_action` | agent logs an action |
| `approval_requested` | agent submits an approval request |
| `settings-changed` | settings patched |
| `ping` | every 25s keepalive |

---

## Dashboard

`GET /dashboard/state` — everything the live dashboard needs in one call.
`GET /dashboard` is kept as a backward-compatible alias returning the identical payload.

Returns: `{ summary, ticker, projects, tasks, ideas, recentNotes, agentActions, upcomingDeadlines }` where:

- `summary` = `{ activeProjects, openTasks, blockedItems, ideas, dueToday, overdue, completedToday }`
- `tasks` = `{ inProgress, todo, waiting, blocked, dueSoon, dueToday, completedToday }`
- `upcomingDeadlines` = merged tasks + projects due within 7 days (overdue included), each `{ id, title, dueDate, priority, status, kind }`

See [DASHBOARD.md](./DASHBOARD.md) for the full shape and selection rules.

---

## Projects

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List. Filters: `status`, `category`, `priority`, `q`, `includeArchived=true` |
| GET | `/projects/:id` | One project **including `notes` and `attachments` arrays** |
| POST | `/projects` | Create. Required: `title` |
| PATCH | `/projects/:id` | Partial update |
| DELETE | `/projects/:id` | Soft-archive |
| POST | `/projects/:id/archive` | Archive |
| GET/POST | `/projects/:id/notes` | Notes timeline / add note |
| GET/POST | `/projects/:id/attachments` | Attachments |

## Tasks

| Method | Path | Description |
|---|---|---|
| GET | `/tasks` | List. Filters: `status`, `area`, `priority`, `q`, `dueBefore`, `agentCandidate=true`, `includeArchived=true`, `topLevel=true`, `parentTaskId` |
| GET | `/tasks/:id` | One task including `parentTask`, `subtasks`, `notes`, and `attachments` |
| POST | `/tasks` | Create. Required: `title` |
| PATCH | `/tasks/:id` | Partial update |
| DELETE | `/tasks/:id` | Soft-archive |
| POST | `/tasks/:id/archive` | Archive |
| POST | `/tasks/:id/complete` | Mark done |
| GET/POST | `/tasks/:id/notes` | Notes / add note |
| GET/POST | `/tasks/:id/attachments` | Attachments |

Task create and patch bodies accept `parentTaskId`. Omit it or send `null` for a
main task; send an existing top-level task ID for a subtask. Task list/detail
responses include derived `parentTaskTitle`, `subtaskCount`, and
`completedSubtaskCount`. `source` records task provenance and derived
`subtaskPlanSource` identifies who created the active child plan. Only one
hierarchy level is supported.

Completing a main task with open subtasks returns `VALIDATION_ERROR`; complete or
archive the children first.

## Ideas

| Method | Path | Description |
|---|---|---|
| GET | `/ideas` | List. Filters: `status`, `category`, `priority`, `q`, `includeArchived=true` |
| GET | `/ideas/:id` | One idea including `notes` |
| POST | `/ideas` | Create. Required: `title` |
| PATCH | `/ideas/:id` | Partial update |
| DELETE | `/ideas/:id` | Soft-archive |
| POST | `/ideas/:id/archive` | Archive |
| POST | `/ideas/:id/convert-to-task` | Returns `{task, idea}` |
| POST | `/ideas/:id/convert-to-project` | Returns `{project, idea}` |
| GET/POST | `/ideas/:id/notes` | Notes / add note |

## Notes

| Method | Path | Description |
|---|---|---|
| GET | `/notes` | Combined feed, newest first. Filters: `parentType`, `parentId`, `type`, `createdBy`, `limit` |
| GET | `/notes/:id` | One note |
| POST | `/notes` | Create. Required: `body`, `parentType`, `parentId` |
| PATCH | `/notes/:id` | Update `body` / `type` |
| DELETE | `/notes/:id` | Hard delete |

## Attachments

| Method | Path | Description |
|---|---|---|
| GET | `/attachments` | List. Filters: `parentType`, `parentId`, `type` |
| GET | `/attachments/:id` | One attachment |
| POST | `/attachments` | Create. Required: `parentType`, `parentId`, and `url` or `filePath` |
| PATCH | `/attachments/:id` | Update |
| DELETE | `/attachments/:id` | Hard delete |

## Agent actions (log)

| Method | Path | Description |
|---|---|---|
| GET | `/agent/actions` | List, newest first. Filters: `agentName`, `actionType`, `limit` |
| POST | `/agent/actions` | Append entry. Required: `summary` |

## Agent Approvals *(Beta 2)*

| Method | Path | Description |
|---|---|---|
| GET | `/approvals` | All approvals. Filter: `status` |
| GET | `/approvals/pending` | Pending approvals only (array) |
| POST | `/approvals` | Create an approval request. Required: `agentName`, `actionType`, `reason` |
| POST | `/approvals/:id/approve` | Approve. Optional body: `resolvedBy` |
| POST | `/approvals/:id/reject` | Reject. Optional body: `resolvedBy` |

## AI Summaries *(Beta 2)*

| Method | Path | Description |
|---|---|---|
| GET | `/ai/config` | Active provider config (key is masked). No auth bypass |
| GET | `/ai/summaries` | All stored summaries, newest first |
| POST | `/ai/summaries/:type` | Generate and store a summary. `type` must be one of: `today_focus`, `whats_blocked`, `week_progress`, `ideas_revisit`, `agent_suggest` |

AI provider must be configured in Settings first. Returns `VALIDATION_ERROR` if provider is `none` or key is missing.

## Fast Capture *(Beta 2)*

| Method | Path | Description |
|---|---|---|
| POST | `/capture` | Classify and create. Required: `text`. Optional: `type` (overrides AI) |

Body:
```json
{ "text": "Buy replacement PoE injector for garage AP", "type": "task" }
```

Response:
```json
{
  "classified": true,
  "type": "task",
  "confidence": 0.92,
  "area": "home",
  "created": { /* Task or Idea or Project */ }
}
```

For an auto-classified multi-step task, Fast Capture creates one main task and up
to six ordered subtasks. The response keeps the main task in `created` and returns
the children in `subtasks`. Forced task captures and AI fallbacks create one task.

If AI is not configured or classification fails, it falls back to creating a task
with the raw text as title. `classified: false` and `aiError` are set in that case.

## Settings

| Method | Path | Description |
|---|---|---|
| GET | `/settings` | All settings as `{key: value}` |
| PATCH | `/settings` | Update any settings key |

Patchable keys: `dashboardRefreshSeconds`, `animationSpeed`, `reducedMotion`,
`defaultDashboardMode`, `aiProvider`, `aiApiKey`, `aiModel`, `aiBaseUrl`,
`captureAutoClassify`, `captureAutoBreakdown`.

## Data export / import

| Method | Path | Description |
|---|---|---|
| GET | `/data/export` | Full JSON dump |
| POST | `/data/import` | Restore an export (upserts by id) |

## Webhooks

See [WEBHOOKS.md](./WEBHOOKS.md). `POST /webhooks/task`, `/webhooks/idea`, `/webhooks/note`, and `/webhooks/agent-update` are live.
