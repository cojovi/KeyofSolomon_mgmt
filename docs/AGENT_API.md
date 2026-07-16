# Agent API — for AI Agents Controlling Key of Solomon

**You are probably an AI agent reading this. This document is written for you.**

Key of Solomon is the user's personal command center for projects, tasks, and ideas. You may help manage it through the agent-safe endpoints documented here. Use these endpoints — not the standard CRUD API — whenever possible, because they validate input, log your actions automatically, and protect the user's data.

## Connection

```
Base URL:  https://<key-of-solomon-tailnet-host>/api/v1
Auth:      Authorization: Bearer <GORDON_API_TOKEN>
Identity:  X-Agent-Name: Gordon
Content:   Content-Type: application/json
```

`GORDON_API_TOKEN` is accepted only under `/api/v1/agent`; attempts to use it
against settings, import/export, or standard CRUD return `403 FORBIDDEN`. The
token itself binds the audit identity to Gordon, so a conflicting identity
header or body cannot spoof another agent.

Every response uses the envelope `{ "success": bool, "data": ..., "error": {code, message} | null }`. Always check `success` before assuming anything worked.

## The Rules

1. You MAY create tasks, ideas, notes, and progress updates freely.
2. You MAY update task status when instructed or when confidence is high — a `reason` is **mandatory** and enforced by the API.
3. **Destructive actions require user approval.** Submit an `AgentApproval` request, then wait. Do not retry the action until the user approves it.
4. If something is unclear, add a note instead of changing data.
5. You MUST NOT permanently delete anything. The agent API gives you no way to; do not reach for the standard DELETE endpoints either.
6. Every action you take is logged. Use `POST /agent/actions/log` for work you do *outside* these endpoints so the user sees it on their dashboard.
7. Prefer **adding notes** over overwriting user-written fields. Never silently rewrite a title, description, or body the user wrote.
8. Do NOT mark tasks `done` unless explicitly told to, or you yourself completed the work.
9. Tasks with `agentCandidate: true` are your **preferred work targets** — the user flagged those for you.

## Responsibility boundary

Key of Solomon's embedded AI and the external agent have separate ownership:

| System | Owns | Must not do |
|---|---|---|
| Embedded AI | Fast Capture classification, optional initial subtask structure, stored summaries | Ongoing task management, status changes, execution |
| Gordon / external agent | Execution, status changes, notes, research, deliberate plan extensions | Recreate an existing task or generate a second subtask plan |

Tasks expose `source`; main tasks also expose derived `subtaskPlanSource`. Use
those fields together with `subtaskCount` before creating work.

## What requires approval

Actions in the **needs-approval** tier — submit a `POST /agent/approvals` request before attempting them:

- Marking a task `done` (when not explicitly instructed in the current session)
- Archiving anything
- Converting an idea to a project
- Setting a task to `urgent`
- Modifying a user-written title or description

Actions in the **safe** tier — proceed directly without an approval:

- Creating tasks, ideas, notes
- Adding notes / progress updates
- Changing status to `in_progress`, `waiting`, or `blocked`
- Logging agent actions

---

## Read endpoints

### `GET /agent/context/today`

Your morning briefing. Returns:

```json
{
  "generatedAt": "…",
  "dueToday": [Task], "overdue": [Task], "urgent": [Task],
  "blocked": [Task], "waiting": [Task], "stale": [Task], "inProgress": [Task],
  "agentCandidates": [Task],
  "activeProjects": [Project],
  "recentNotes": [Note],
  "pendingApprovals": [AgentApproval]
}
```

Task entries include hierarchy fields and `lastRemindedAt`. `stale` means an
open task whose `updatedAt` is at least 14 days old.

### `GET /agent/context/dashboard`

Full dashboard state (same shape as `GET /dashboard/state`). Calling it logs a `dashboard_request` action.

### `GET /agent/tasks/available`

Open tasks (`todo` / `in_progress` / `waiting`), sorted: agent candidates first,
then priority, then recency. Max 50. Results include `source`, `subtaskCount`, and
`subtaskPlanSource`.

### Agent-safe entity detail

- `GET /agent/tasks/:id` — task hierarchy, notes, attachments, and `lastRemindedAt`
- `GET /agent/projects/:id` — project, notes, and attachments
- `GET /agent/ideas/:id` — idea, notes, and attachments

---

## Write endpoints

### `POST /agent/tasks/create`

```json
{ "title": "Re-run failing backup job", "description": "…", "area": "coding",
  "priority": "high", "dueDate": "2026-06-15", "tags": ["backup"],
  "agentCandidate": true, "parentTaskId": null,
  "reason": "User asked me to track this" }
```

Required: `title`. Returns `{ task, action }` (201). Exact normalized duplicates
among open sibling tasks return `409 DUPLICATE_TASK` with the existing task.

Use the atomic endpoint below for a complete subtask plan. Single subtask creation
with `parentTaskId` is retained for compatibility, but adding to an existing plan
requires `extendExistingPlan: true` and a reason.

### `POST /agent/tasks/:id/create-subtasks`

```json
{
  "subtasks": [
    { "title": "Find the recommended provider", "priority": "high" },
    { "title": "Confirm availability" },
    { "title": "Book the appointment" }
  ],
  "reason": "Initial execution plan for the captured outcome"
}
```

Creates 1-8 subtasks transactionally and logs one note/action. If any active
subtasks already exist, returns `409 SUBTASK_PLAN_EXISTS`. To add a genuinely new
requirement, resend with `extendExistingPlan: true` and explain why. Existing or
payload duplicate titles return `DUPLICATE_TASK` / `VALIDATION_ERROR`.

### `POST /agent/tasks/:id/update-status`

```json
{ "status": "in_progress", "reason": "Starting work on the API docs now" }
```

- `status` must be one of `todo | in_progress | waiting | blocked | done | archived`.
- `reason` is **required**.
- Side effects: an `agent_update` note is added to the task, a `status_change` action is logged.
- A main task cannot be marked `done` until all non-archived subtasks are done.
- Verified self-completion requires `completedByAgent: true` and a non-empty
  `evidence` string; the evidence is stored as a progress note.
- Completion not performed by the agent requires an approved `mark_complete`
  approval and its `approvalId`. Archiving similarly requires an approved
  `archive` approval ID.

Verified self-completion example:

```json
{
  "status": "done",
  "reason": "Implemented and verified the requested change",
  "completedByAgent": true,
  "evidence": "Tests pass and the expected API response was observed"
}
```

### `POST /agent/tasks/:id/set-parent`

```json
{ "parentTaskId": "task_main", "reason": "This is a step toward the same user outcome" }
```

Set `parentTaskId` to an existing main task to make the target a subtask, or set
it to `null` to detach it. `reason` is required. The endpoint validates the
one-level hierarchy and logs both a task note and agent action.

### `POST /agent/tasks/:id/add-note`
### `POST /agent/projects/:id/add-note`
### `POST /agent/ideas/:id/add-note`

```json
{ "body": "Deployed the fix; monitoring for 24h.", "type": "progress" }
```

Required: `body`. `type` defaults to `agent_update`. Returns `{ note, action }`.

### `POST /agent/ideas/create`

```json
{ "title": "Auto-archive stale tasks after 90 days", "body": "…",
  "category": "coding", "priority": "medium", "tags": ["automation"] }
```

Required: `title`.

### `POST /agent/ideas/:id/convert-to-task`

```json
{ "reason": "User approved this idea in chat", "priority": "high", "agentCandidate": true }
```

Required: `reason`. Optional overrides: `title`, `description`, `area`, `priority`, `tags`, `dueDate`, `agentCandidate`.

### `POST /agent/ideas/:id/convert-to-project`

```json
{ "reason": "User said this is a full project now", "priority": "high" }
```

Required: `reason`. Optional overrides: `title`, `shortDescription`, `category`, `priority`, `tags`, `dueDate`.

**Note:** converting an idea to a project is in the **needs-approval** tier.
Submit `POST /agent/approvals` with `actionType: "convert_idea_to_project"`,
wait for approval, and pass the approved `approvalId` to this endpoint.

### `POST /agent/actions/log`

For visibility into work done outside this API.

```json
{ "actionType": "update", "targetType": "task", "targetId": "task_abc123",
  "summary": "Refactored the seed script", "details": "Split into fixtures + loader." }
```

Required: `summary`. `actionType` one of: `create`, `update`, `status_change`,
`add_note`, `convert_idea`, `dashboard_request`, `reminder`, `error`. Use
`reminder` for owner notifications so the context API can enforce cooldowns
without adding noisy task notes.

---

## Approval system *(Beta 2)*

### `POST /agent/approvals`

Submit a request for user approval before a destructive action.

```json
{
  "actionType": "convert_idea_to_project",
  "targetType": "idea",
  "targetId": "idea_abc123",
  "payload": { "title": "Mini-Home Website", "priority": "high" },
  "reason": "User mentioned this idea is ready to become a full project."
}
```

Required: `actionType`, `reason`, and `payload`. Gordon's identity is supplied
by the scoped token. Returns the approval with `status: "pending"`.

Approval reads include a safe `target` snapshot with the referenced entity's
type, ID, title, status, and current existence. When the owner resolves the
request, `resolutionNote` may explain the decision. Treat that note as context;
it does not authorize a different gated action.

### Listening for resolution

OpenClaw receives approval resolution through the `/solomon` hook. Poll
`GET /agent/approvals/:id` when needed. When status is `approved`, pass its ID
to the gated endpoint. When rejected, drop the action and note why.

### `GET /agent/approvals/pending`

Returns array of all pending approvals. Useful to check if you have outstanding requests before submitting new ones.

The embedded Agent Center chat is an owner-facing OpenClaw Gateway surface. It
does not expand this scoped token: any task-system changes requested in chat must
still use `/api/v1/agent/**`, preserve user-authored content, and pass the same
approval gates. The Gordon token is intentionally rejected on the full-token
`/api/v1/integrations/openclaw/chat/**` routes.

---

## What you must avoid

- ❌ `DELETE` anything. Archive is the only removal, only via status updates with a reason.
- ❌ Overwriting titles, descriptions, or body text the user wrote.
- ❌ Marking tasks `done` speculatively.
- ❌ Creating duplicate tasks — check `GET /agent/tasks/available` first.
- ❌ Calling raw `/projects`, `/tasks`, `/ideas` write endpoints when an agent endpoint exists.
- ❌ Taking a needs-approval action without first getting `status: "approved"` from the approvals API.

---

## Recommended workflows

### Pick up and work a task

```
1. GET  /agent/context/today                 → find agentCandidates
2. POST /agent/tasks/:id/update-status       {status:"in_progress", reason:"…"}
3. …do the actual work…
4. POST /agent/tasks/:id/add-note            {body:"What I did", type:"progress"}
5a. If Gordon completed it: POST status with completedByAgent:true + evidence
5b. Otherwise: POST /agent/approvals {actionType:"mark_complete", payload:{status:"done"}, reason:"…"}
6. On approval: POST status with approvalId
```

### Capture something the user said

```
1. Actionable + clear      → POST /agent/tasks/create
2. Raw thought/maybe-later → POST /agent/ideas/create
3. Ambiguous               → POST /agent/ideas/create + add-note with what needs review
4. Needs fast AI classify  → POST /capture   {text:"…"}   (skips agent endpoint)
```

### Break a task into steps

```
1. GET  /agent/tasks/available                       → inspect subtaskCount/subtaskPlanSource
2. If subtaskCount > 0                               → work the existing plan
3. If subtaskCount = 0: POST /agent/tasks/:id/create-subtasks
4. Only for a new requirement                        → extendExistingPlan:true + reason
5. Complete the main task only after every active subtask is done
```

### You hit a blocker

```
1. POST /agent/tasks/:id/update-status   {status:"blocked", reason:"Waiting on API key"}
2. POST /agent/actions/log               {actionType:"error", summary:"…"} if it was your failure
```

### Convert an idea with approval

```
1. POST /agent/approvals  {actionType:"convert_idea_to_project", targetType:"idea", targetId:"idea_xyz", payload:{}, reason:"…"}
2. Poll GET /agent/approvals/:id  (or wait for the OpenClaw hook)
3. If approved: POST /agent/ideas/:id/convert-to-project {reason:"Approved by user", approvalId:"appr_…"}
4. If rejected:  POST /agent/ideas/:id/add-note  {body:"User declined conversion — keeping as idea"}
```

---

## Quick smoke test

```bash
TOKEN=$(grep GORDON_API_TOKEN .env | cut -d= -f2)
curl -s http://localhost:8787/api/v1/agent/context/today \
  -H "Authorization: Bearer $TOKEN" -H "X-Agent-Name: Gordon" | head -c 400
```

If `success` is `true`, you're in.
