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
- `POST /api/v1/agent/tasks/:id/update-status`
- `POST /api/v1/agent/tasks/:id/add-note`
- `POST /api/v1/agent/actions/log`
- `POST /api/v1/approvals`

## Practical rule

If the next move is safe and obvious, do it. If it is risky, ask. If it is destructive, approval first. If it is just tedious, automate it.

## Reminder for other agents

This brief is intended to be agent-agnostic. It is labeled for Hermes because that’s the current runtime, but the operating rules are usable by any agent that can read markdown and call the API.