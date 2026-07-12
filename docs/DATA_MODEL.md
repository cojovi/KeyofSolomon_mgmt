# Data Model

All entities use string IDs with a type prefix (`proj_`, `task_`, `idea_`, `note_`, `att_`, `act_`, `appr_`, `asum_`), ISO-8601 timestamps, and JSON-array tags. Soft delete = `status: "archived"` + `archivedAt` timestamp.

## Project

```ts
Project {
  id: string                  // "proj_xxxxxxxxxxxxxxxx"
  title: string               // required
  shortDescription?: string
  longDescription?: string
  category?: string
  status: "planning" | "active" | "paused" | "blocked" | "completed" | "archived"
  priority?: "low" | "medium" | "high" | "urgent"
  progressPercent: number     // 0-100, manually edited
  tags: string[]
  dueDate?: string            // ISO date
  createdAt: string
  updatedAt: string
  archivedAt?: string
}
```

## Task

```ts
Task {
  id: string                  // "task_…"
  title: string               // required
  description?: string
  area?: string               // work, personal, home, coding, business, errands…
  parentTaskId?: string       // null/absent = main task; task ID = subtask of that task
  source: "user" | "agent" | "fast_capture" | "embedded_ai"
        | "webhook" | "idea_conversion" | "seed"
  status: "todo" | "in_progress" | "waiting" | "blocked" | "done" | "archived"
  priority?: "low" | "medium" | "high" | "urgent"
  dueDate?: string
  tags: string[]
  agentCandidate: boolean     // true = AI agent may pick this up as a work target
  createdAt: string
  updatedAt: string
  completedAt?: string        // auto-set when status → "done"
  archivedAt?: string
}
```

Task hierarchy is intentionally one level deep: a main task may have subtasks, but a
subtask cannot have children of its own. API responses also derive
`parentTaskTitle`, `subtaskCount`, `completedSubtaskCount`, and
`subtaskPlanSource` for display; these are not stored columns.
`subtaskPlanSource` is the common child source or `mixed`. `GET /tasks/:id` adds
`parentTask` and `subtasks`.

Main tasks with open subtasks cannot be completed. Finish or archive every child
first. A completed main task must be reopened before an active subtask can be added
or reopened beneath it.

## Idea

```ts
Idea {
  id: string                  // "idea_…"
  title: string               // required
  body?: string
  category?: string
  status: "captured" | "reviewing" | "possible" | "converted" | "archived"
  priority?: "low" | "medium" | "high"
  tags: string[]
  createdAt: string
  updatedAt: string
  convertedToType?: "task" | "project"
  convertedToId?: string
  archivedAt?: string
}
```

## Note / Progress Update

```ts
Note {
  id: string                  // "note_…"
  parentType: "project" | "task" | "idea"
  parentId: string
  body: string                // required
  type: "note" | "progress" | "decision" | "blocker" | "agent_update"
  createdBy: "user" | "agent" | "system"
  createdAt: string
}
```

Creating a note bumps the parent's `updatedAt`.

## Attachment

```ts
Attachment {
  id: string                  // "att_…"
  parentType: "project" | "task" | "idea" | "note"
  parentId: string
  label?: string
  url?: string
  filePath?: string
  type?: "link" | "file" | "image" | "document" | "other"
  createdAt: string
}
```

One of `url` or `filePath` is required.

## Agent Action Log

```ts
AgentAction {
  id: string                  // "act_…"
  agentName: string
  actionType: "create" | "update" | "status_change" | "add_note"
            | "convert_idea" | "dashboard_request" | "error"
  targetType?: "project" | "task" | "idea" | "note"
  targetId?: string
  summary: string
  details?: string
  createdAt: string
}
```

## Agent Approval *(Beta 2)*

Approval requests that agents must get resolved before taking destructive actions.

```ts
AgentApproval {
  id: string                  // "appr_…"
  agentName: string
  actionType: string          // e.g. "mark_done", "archive", "convert_idea_to_project"
  targetType?: string
  targetId?: string
  payload: object             // the full action payload, stored as JSON
  reason: string              // required — why the agent wants to do this
  status: "pending" | "approved" | "rejected"
  requestedAt: string
  resolvedAt?: string
  resolvedBy?: string         // "user" or whoever resolved it
}
```

## AI Summary *(Beta 2)*

Stored output from an AI provider summary generation call.

```ts
AISummary {
  id: string                  // "asum_…"
  type: "today_focus" | "whats_blocked" | "week_progress" | "ideas_revisit" | "agent_suggest"
  content: string             // the generated text
  generatedAt: string
  provider: string            // "anthropic" | "openai" | "openrouter" | "ollama"
}
```

Only the most recent summary per type is returned by default from `GET /ai/summaries`.

## Settings (key/value)

| Key | Default | Meaning |
|---|---|---|
| `dashboardRefreshSeconds` | `30` | Polling fallback interval |
| `animationSpeed` | `1` | Animation multiplier (0.5 = slower, 2 = faster) |
| `reducedMotion` | `false` | `true` disables all animation |
| `defaultDashboardMode` | `full` | Reserved |
| `aiProvider` | `none` | `anthropic` \| `openai` \| `openrouter` \| `ollama` \| `none` |
| `aiApiKey` | `""` | API key for the selected provider (stored locally, never transmitted) |
| `aiModel` | `""` | Model name (defaults per provider if blank) |
| `aiBaseUrl` | `""` | Base URL for Ollama (default: `http://localhost:11434`) |
| `captureAutoClassify` | `true` | `true` = use AI on `/capture` requests |
| `captureAutoBreakdown` | `true` | `true` = embedded AI may create the initial subtask plan during Fast Capture |
