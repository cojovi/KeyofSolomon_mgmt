# Hermes Agent Brief — Key of Solomon

This is the short operating brief for Hermes-compatible agents working in **Key of Solomon** (formerly **Neondeck**).

If you only read one project doc before acting, read this one.

## Mission

Help Cody use Key of Solomon as an AI-operated task / project / idea command center.
The goal is to stay current, keep work moving, surface blockers, and reduce manual prompting.

## Source of truth

Priority order:

1. Repo docs in `docs/`
2. `AGENTS.md`
3. Live app state / API responses
4. Memory / old conversation context

If anything conflicts, trust the repo docs and live data.

## Core operating style

- Be proactive.
- Prefer action over narration.
- Batch independent checks together.
- Keep asking questions to a minimum.
- Only stop and ask when the next move is genuinely ambiguous or risky.
- When a safe action is available, take it.

## Autonomous workflow

When working this project, use this loop:

1. Inspect current state with the agent context endpoints.
2. Identify the smallest useful next action.
3. Take the action.
4. Log the action if it happened outside the agent API.
5. Add a note instead of rewriting user-authored text when unsure.
6. If the action is destructive or user-visible in a bad way, request approval first.
7. Keep going until the task is actually resolved or blocked.

## Breaking work into subtasks

When one user outcome needs several concrete steps, keep the outcome as one main
task and create each step with `parentTaskId` set to that main task's ID. Do not
create a flat cluster of peer tasks for one outcome.

1. Check `/api/v1/agent/tasks/available` for an existing main task and its
   `subtaskCount` / `subtaskPlanSource`.
2. If a plan exists, work it. Do not decompose the task again.
3. If no plan exists, create 2-6 steps atomically with
   `POST /agent/tasks/:id/create-subtasks`.
4. Extend an existing plan only for a newly discovered requirement, using
   `extendExistingPlan: true` plus a concrete reason.
5. Work and complete subtasks first; the API rejects early parent completion.

Use separate main tasks only when the items represent genuinely independent
outcomes. Task hierarchy is one level deep.

## AI ownership boundary

- Embedded AI is limited to Fast Capture classification, the optional initial
  subtask plan, and read-only summaries.
- Hermes owns ongoing judgment, execution, status changes, notes, and deliberate
  plan extensions.
- Treat `source` and `subtaskPlanSource` as ownership signals, not decoration.
- `DUPLICATE_TASK` means reuse the existing task.
- `SUBTASK_PLAN_EXISTS` means work the existing plan; do not retry with altered wording.

## Safe actions

Proceed directly with:

- creating tasks, ideas, notes
- adding progress updates
- changing task status to `in_progress`, `waiting`, or `blocked`
- logging agent actions
- checking context, available tasks, and dashboard state

## Approval-gated actions

Request approval first for:

- marking a task `done` unless explicitly instructed in the current session
- archiving anything
- converting an idea to a project
- setting a task to `urgent`
- modifying a user-written title or description

## Never do this

- Never hard-delete data.
- Never silently overwrite user-written content.
- Never speculate that something worked without checking the response.
- Never ignore the approval system for gated actions.

## Recommended API entry points

- `GET /api/v1/agent/context/today`
- `GET /api/v1/agent/tasks/available`
- `GET /api/v1/dashboard/state`
- `POST /api/v1/agent/tasks/create`
- `POST /api/v1/agent/tasks/:id/create-subtasks`
- `POST /api/v1/agent/tasks/:id/set-parent`
- `POST /api/v1/agent/tasks/:id/update-status`
- `POST /api/v1/agent/tasks/:id/add-note`
- `POST /api/v1/agent/actions/log`
- `POST /api/v1/approvals`

## Practical rule

If the next move is safe and obvious, do it. If it is risky, ask. If it is destructive, approval first. If it is just tedious, automate it.

## Reminder for other agents

This brief is intended to be agent-agnostic. It is labeled for Hermes because that’s the current runtime, but the operating rules are usable by any agent that can read markdown and call the API.
