# Status Rules

## Task statuses

| Status | Meaning | Notes |
|---|---|---|
| `todo` | Not started | Default for new tasks |
| `in_progress` | Actively being worked | Shown prominently on dashboard |
| `waiting` | Paused on someone/something external, not hard-blocked | e.g. waiting on a shipment |
| `blocked` | Cannot proceed | High-attention: red, pulsing, in ticker |
| `done` | Finished | `completedAt` auto-set; struck through in UI |
| `archived` | Hidden from normal views | Soft delete; `archivedAt` set |

Transitions: any → any is allowed (this is a personal tool, not a workflow engine). Helpers: `POST /tasks/:id/complete` → `done`; `POST /tasks/:id/archive` / `DELETE` → `archived`. Setting status back from `done` clears nothing automatically except `archivedAt` handling — `completedAt` stays as history.

Agents changing task status **must supply a reason** (see AGENT_API.md).

### Main tasks and subtasks

- A task with no `parentTaskId` is a main task. A task with `parentTaskId` is a subtask.
- Hierarchy is limited to one level; subtasks cannot contain more subtasks.
- A main task cannot move to `done` while any non-archived subtask is still open.
- Archived subtasks do not block parent completion.
- Active subtasks cannot be added to a completed parent. Reopen the parent first.
- Parent status does not otherwise change automatically when a subtask changes.

## Project statuses

| Status | Meaning |
|---|---|
| `planning` | Defined, not started. Default |
| `active` | In motion; counted in dashboard "Active Projects" |
| `paused` | Intentionally on hold |
| `blocked` | Stuck on something external; surfaced in ticker + red card |
| `completed` | Finished |
| `archived` | Soft-deleted |

`progressPercent` is manual and independent of status — a `blocked` project keeps its progress.

## Idea statuses

| Status | Meaning |
|---|---|
| `captured` | Raw capture. Default |
| `reviewing` | Being thought about |
| `possible` | Worth doing eventually |
| `converted` | Became a task or project — `convertedToType`/`convertedToId` point at it. Terminal |
| `archived` | Discarded (soft) |

`converted` is set only by the convert endpoints; converting twice fails.

## Priorities

`low` → `medium` → `high` → `urgent` (ideas max out at `high`).

`urgent` items get the strongest visual treatment: pulsing badges and guaranteed ticker placement. `high`-priority ideas also enter the ticker.

## Dashboard attention rules

- **Overdue** = open task with `dueDate` in the past → red, ticker.
- **Due soon** = open task due within 3 days → amber, "DUE SOON" block.
- **Stale** = open task untouched for 14+ days → ticker as "STALE".
- **Blocked** anything → ticker + pulsing red.
