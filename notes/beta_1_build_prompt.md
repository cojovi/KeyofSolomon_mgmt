You are building Beta 1 of a personal task, project, idea, and AI-agent management system.

The app is not just a dashboard. It is both:

1. A full input/editing system for creating, updating, organizing, and reviewing work.
2. A live animated dashboard meant to run full-screen on a dedicated device.

The user will attach screenshots/images of dashboard styles they like. Use those images as visual inspiration for colors, spacing, card styling, glassmorphism/neon/dark-mode/dashboard aesthetics, typography vibe, and animation feel. Do not treat the images as strict wireframes. Do not simply clone them. Build a clean original layout inspired by them.

The target user has ADD/ADHD-style attention needs, so the live dashboard should be visually active and glanceable. Moving elements, scrolling tickers, rotating cards, animated blocks, progress bars, and attention-grabbing status changes are desired.

This is Beta 1, so prioritize a complete, usable foundation over unnecessary polish.

---

# Project Goal

Build a local-first task/project/idea command center with:

- Project tracking
- Standalone task tracking
- Idea capture
- Notes/progress history
- Attachments/links
- Live animated dashboard
- Control panel for editing and creating items
- Local API backend
- Agent-specific API endpoints for OpenClaw/AI agents
- Markdown documentation explaining exactly how the API works

The AI agent may run on the same machine as the app, so the API can be private/localhost-first. Still, the API must be clean, documented, predictable, and safe.

Default local API base:

```txt
http://localhost:8787/api/v1
```

---

# Recommended Tech Stack

Use a practical modern full-stack setup.

Preferred stack:

- Frontend: Next.js + TypeScript
- Styling: Tailwind CSS
- Backend/API: Next.js API routes or a separate Node/Express/Fastify backend
- Database: SQLite for Beta 1
- ORM: Prisma or Drizzle
- Realtime updates: WebSockets or Server-Sent Events
- Local file/config storage where needed
- Markdown docs committed in `/docs`

SQLite is preferred for Beta 1 because this app will likely run locally on one device.

Do not over-engineer for multi-user cloud hosting yet.

---

# Main UI Structure

Create two main UI modes:

## 1. Control Panel

Route example:

```txt
/app
```

Purpose:

This is where the user creates, edits, searches, filters, and manages data.

The Control Panel should include:

- Sidebar navigation
- Projects page
- Tasks page
- Ideas page
- Notes/activity page
- Agent activity page
- Settings page
- Quick-add input
- Full edit forms
- Search
- Filters
- Status dropdowns
- Progress controls
- Attachment/link fields
- Notes timeline for each item

The Control Panel should be clean, fast, practical, and easy to edit from.

This side does not need heavy animation.

## 2. Live Dashboard

Route example:

```txt
/dashboard
```

Purpose:

This is the fullscreen animated read-only dashboard.

The Dashboard should include:

- Scrolling ticker for urgent/stale/active items
- Animated project cards
- Task status blocks
- Progress bars
- Rotating idea cards
- Recently updated feed
- Blocked/waiting alerts
- Agent activity ticker
- “Today / Active / Blocked / Ideas / Recently Updated” sections
- Optional animated agent/avatar placeholder

The dashboard should be visually appealing, readable from a distance, and active enough to draw attention.

It should automatically update when data changes.

Use motion carefully. It should feel alive, not like a casino had a panic attack.

---

# Core Data Types

Create these main entities:

1. Project
2. Task
3. Idea
4. Note / Progress Update
5. Attachment
6. Agent Action Log

Tasks should be standalone. They do not have to belong to projects.

Projects can have notes, attachments, progress, and status.

Ideas are separate from tasks/projects. They are for raw thoughts that may later become tasks or projects.

---

# Data Model Requirements

Use IDs, timestamps, and soft-delete/archive behavior where reasonable.

## Project

Fields:

```ts
Project {
  id: string
  title: string
  shortDescription?: string
  longDescription?: string
  category?: string
  status: "planning" | "active" | "paused" | "blocked" | "completed" | "archived"
  priority?: "low" | "medium" | "high" | "urgent"
  progressPercent: number // 0-100
  tags: string[]
  dueDate?: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
}
```

Project behavior:

- Projects are larger containers for ongoing work.
- Projects should support notes/progress updates.
- Projects should support attachments and links.
- Progress should be manually editable.
- Project cards on the dashboard should visually show progress.

## Task

Fields:

```ts
Task {
  id: string
  title: string
  description?: string
  area?: string // examples: work, personal, home, coding, business, errands
  status: "todo" | "in_progress" | "waiting" | "blocked" | "done" | "archived"
  priority?: "low" | "medium" | "high" | "urgent"
  dueDate?: string
  tags: string[]
  agentCandidate: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
  archivedAt?: string
}
```

Task behavior:

- Tasks are standalone.
- Tasks do not need to be attached to a project.
- Tasks need clear status and due date handling.
- Dashboard should highlight urgent, overdue, blocked, and in-progress tasks.

## Idea

Fields:

```ts
Idea {
  id: string
  title: string
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

Idea behavior:

- Ideas should be quick to capture.
- Ideas should have their own tab/page.
- Ideas should be visible on the dashboard in a rotating carousel.
- Ideas can later be converted into tasks or projects.

## Note / Progress Update

Fields:

```ts
Note {
  id: string
  parentType: "project" | "task" | "idea"
  parentId: string
  body: string
  type: "note" | "progress" | "decision" | "blocker" | "agent_update"
  createdBy: "user" | "agent" | "system"
  createdAt: string
}
```

Note behavior:

- Notes should create a timeline/history.
- Notes can be attached to projects, tasks, or ideas.
- Agent updates should also appear here where appropriate.

## Attachment

Fields:

```ts
Attachment {
  id: string
  parentType: "project" | "task" | "idea" | "note"
  parentId: string
  label?: string
  url?: string
  filePath?: string
  type?: "link" | "file" | "image" | "document" | "other"
  createdAt: string
}
```

Attachment behavior:

- Beta 1 can support links and local file paths.
- Full upload handling can be basic.

## Agent Action Log

Fields:

```ts
AgentAction {
  id: string
  agentName: string
  actionType:
    | "create"
    | "update"
    | "status_change"
    | "add_note"
    | "convert_idea"
    | "dashboard_request"
    | "error"
  targetType?: "project" | "task" | "idea" | "note"
  targetId?: string
  summary: string
  details?: string
  createdAt: string
}
```

Agent behavior:

- Every AI-agent action should be logged.
- The dashboard should show recent agent actions.
- The Control Panel should have an Agent Activity page.

---

# Control Panel Features

Build the following pages.

## Dashboard Home / Overview

Shows:

- Count of active projects
- Count of open tasks
- Count of blocked tasks/projects
- Count of ideas
- Recently updated items
- Quick-add bar
- Today’s important items

## Projects Page

Features:

- List/grid of projects
- Create project
- Edit project
- Archive project
- Filter by status/category/priority
- Search by title/description/tag
- Progress slider/input
- Notes timeline
- Attachments section

## Tasks Page

Features:

- List/grid of standalone tasks
- Create task
- Edit task
- Archive task
- Mark done
- Filter by status/area/priority/due date
- Search by title/description/tag
- Toggle `agentCandidate`

## Ideas Page

Features:

- Quick capture idea
- Full edit idea
- Archive idea
- Convert idea into task
- Convert idea into project
- Filter by status/category/tag
- Search ideas

## Notes / Activity Page

Features:

- Combined feed of recent notes and progress updates
- Filter by parent type
- Filter by createdBy: user/agent/system

## Agent Activity Page

Features:

- List recent agent actions
- Show action type
- Show target item
- Show summary/details
- Show timestamp

## Settings Page

Features:

- API base URL display
- Local API key/token display or configuration
- Dashboard refresh interval
- Animation speed setting
- Toggle reduced motion
- Default dashboard mode
- Local data export/import if simple to implement

---

# Live Dashboard Features

The live dashboard should be designed for fullscreen/kiosk display.

Route:

```txt
/dashboard
```

Required dashboard zones:

## 1. Top Status Bar

Show:

- App name
- Current date/time
- Active project count
- Open task count
- Blocked count
- Idea count
- Last updated time

## 2. Scrolling Ticker

A horizontally scrolling ticker with high-attention items:

- Urgent tasks
- Overdue tasks
- Blocked tasks/projects
- Recently updated items
- Agent activity
- Ideas marked high priority

Example ticker items:

```txt
URGENT: Finish API docs
BLOCKED: Mini-home pricing page waiting on assets
IDEA: Animated container configurator
AGENT: OpenClaw added progress note to Dashboard API
```

## 3. Active Projects Area

Animated cards showing:

- Project title
- Short description
- Category
- Status
- Progress bar
- Last updated
- Priority

Cards can slowly slide, pulse, rotate through pages, or move in a calm loop.

## 4. Task Blocks

Show task cards grouped by:

- In Progress
- Todo
- Waiting
- Blocked
- Due Soon

Use strong visual emphasis for blocked/urgent items.

## 5. Ideas Carousel

Rotating idea cards:

- Title
- Body excerpt
- Category
- Tags
- Created date

## 6. Recent Notes / Updates Feed

Vertical feed of recent progress updates and notes.

## 7. Agent Activity Feed

Show recent OpenClaw/agent activity.

Optional:

- Small animated agent avatar placeholder
- Avatar can change state based on activity:
  - idle
  - thinking
  - task updated
  - warning/blocker

Do not spend too much time on avatar polish in Beta 1. Add a clean placeholder system.

---

# Animation Requirements

Animations should be part of the dashboard only.

Use:

- Scrolling ticker
- Subtle card movement
- Rotating carousel
- Pulsing alerts
- Smooth progress bar animation
- Feed updates
- Optional animated avatar

Rules:

- Keep text readable.
- Do not make the dashboard chaotic.
- Provide reduced-motion toggle.
- Animation speed should be configurable.
- Dashboard should still be useful if animations are disabled.

---

# API Requirements

Create a REST JSON API under:

```txt
/api/v1
```

All API responses should be JSON.

Use predictable response shapes:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Error example:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required"
  }
}
```

Authentication for Beta 1:

- Use a simple local API token.
- Token can be stored in `.env`.
- Require header:

```txt
Authorization: Bearer LOCAL_API_TOKEN
```

Since this is local-first, keep security simple but do not leave write endpoints completely open.

---

# Standard API Endpoints

## Health

```txt
GET /api/v1/health
```

Returns app/API status.

## Dashboard State

```txt
GET /api/v1/dashboard/state
```

Returns everything needed for the live dashboard:

- summary counts
- urgent tasks
- blocked items
- active projects
- recent notes
- recent agent actions
- ideas carousel data
- ticker items

## Projects

```txt
GET /api/v1/projects
GET /api/v1/projects/:id
POST /api/v1/projects
PATCH /api/v1/projects/:id
DELETE /api/v1/projects/:id
POST /api/v1/projects/:id/archive
POST /api/v1/projects/:id/notes
GET /api/v1/projects/:id/notes
POST /api/v1/projects/:id/attachments
GET /api/v1/projects/:id/attachments
```

DELETE can soft-delete/archive in Beta 1.

## Tasks

```txt
GET /api/v1/tasks
GET /api/v1/tasks/:id
POST /api/v1/tasks
PATCH /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
POST /api/v1/tasks/:id/archive
POST /api/v1/tasks/:id/complete
POST /api/v1/tasks/:id/notes
GET /api/v1/tasks/:id/notes
POST /api/v1/tasks/:id/attachments
GET /api/v1/tasks/:id/attachments
```

## Ideas

```txt
GET /api/v1/ideas
GET /api/v1/ideas/:id
POST /api/v1/ideas
PATCH /api/v1/ideas/:id
DELETE /api/v1/ideas/:id
POST /api/v1/ideas/:id/archive
POST /api/v1/ideas/:id/convert-to-task
POST /api/v1/ideas/:id/convert-to-project
POST /api/v1/ideas/:id/notes
GET /api/v1/ideas/:id/notes
```

## Notes

```txt
GET /api/v1/notes
GET /api/v1/notes/:id
POST /api/v1/notes
PATCH /api/v1/notes/:id
DELETE /api/v1/notes/:id
```

## Attachments

```txt
GET /api/v1/attachments
GET /api/v1/attachments/:id
POST /api/v1/attachments
PATCH /api/v1/attachments/:id
DELETE /api/v1/attachments/:id
```

## Agent Actions

```txt
GET /api/v1/agent/actions
POST /api/v1/agent/actions
```

---

# Agent-Specific API

Create agent-friendly endpoints that are safer and easier for OpenClaw or another local AI agent to use.

The agent API should exist under:

```txt
/api/v1/agent
```

Required endpoints:

```txt
GET /api/v1/agent/context/today
GET /api/v1/agent/context/dashboard
GET /api/v1/agent/tasks/available
POST /api/v1/agent/tasks/create
POST /api/v1/agent/tasks/:id/update-status
POST /api/v1/agent/tasks/:id/add-note
POST /api/v1/agent/projects/:id/add-note
POST /api/v1/agent/ideas/create
POST /api/v1/agent/ideas/:id/add-note
POST /api/v1/agent/ideas/:id/convert-to-task
POST /api/v1/agent/actions/log
```

## Agent Safety Rules

The agent should not be given raw database access.

Agent endpoints should:

- Validate input
- Log every action
- Return clear success/error responses
- Avoid permanent deletion
- Prefer archive over delete
- Require a reason/note for major changes
- Never silently overwrite large fields without logging

Agent rules:

```txt
1. Agents may create tasks, ideas, notes, and progress updates.
2. Agents may update status when instructed or when confidence is high.
3. Agents should mark unclear items as needs_review or add a note.
4. Agents should not permanently delete anything.
5. Agents should log every action.
6. Agents should prefer adding notes instead of overwriting user-written content.
7. Agents should not mark tasks complete unless explicitly told or the completion is obvious.
8. Agents should use agentCandidate tasks as preferred work targets.
```

---

# Dashboard Data Endpoint Shape

`GET /api/v1/dashboard/state` should return something like:

```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-06-12T12:00:00.000Z",
    "summary": {
      "activeProjects": 4,
      "openTasks": 12,
      "blockedItems": 2,
      "ideas": 18
    },
    "ticker": [
      {
        "type": "urgent",
        "label": "URGENT",
        "text": "Finish API documentation",
        "targetType": "task",
        "targetId": "task_123"
      }
    ],
    "projects": [],
    "tasks": {
      "inProgress": [],
      "todo": [],
      "waiting": [],
      "blocked": [],
      "dueSoon": []
    },
    "ideas": [],
    "recentNotes": [],
    "agentActions": []
  },
  "error": null
}
```

---

# Documentation Requirements

Generate detailed Markdown documentation in a `/docs` folder.

Required files:

```txt
/docs/README.md
/docs/DATA_MODEL.md
/docs/API.md
/docs/AGENT_API.md
/docs/STATUS_RULES.md
/docs/DASHBOARD.md
/docs/WEBHOOKS.md
/docs/LOCAL_SETUP.md
/docs/EXAMPLES.md
```

## README.md

Explain:

- What the app is
- How to run it
- Main features
- Main routes
- API overview

## DATA_MODEL.md

Document:

- Project schema
- Task schema
- Idea schema
- Note schema
- Attachment schema
- AgentAction schema
- Field meanings
- Status meanings

## API.md

Document all standard API endpoints.

For each endpoint include:

- Method
- Path
- Description
- Request body
- Response body
- Error examples

## AGENT_API.md

This is extremely important.

Write this as if an AI coding/automation agent will read it and control the system.

Include:

- Base URL
- Auth header
- All agent-safe endpoints
- Example requests
- Example responses
- Safety rules
- What agents are allowed to change
- What agents should avoid
- Recommended workflows

Example workflow:

```md
# Agent Workflow: Add a progress update to a task

1. Search or retrieve available tasks.
2. Select target task.
3. POST to `/api/v1/agent/tasks/:id/add-note`.
4. Log action using `/api/v1/agent/actions/log`.
5. Confirm dashboard state if needed.
```

## STATUS_RULES.md

Explain all statuses:

Task statuses:

```txt
todo
in_progress
waiting
blocked
done
archived
```

Project statuses:

```txt
planning
active
paused
blocked
completed
archived
```

Idea statuses:

```txt
captured
reviewing
possible
converted
archived
```

## DASHBOARD.md

Explain:

- Dashboard layout
- Dashboard state endpoint
- Animation settings
- Ticker rules
- How items are selected for display

## WEBHOOKS.md

Even if not fully implemented in Beta 1, document planned webhook structure.

Possible future endpoints:

```txt
POST /api/v1/webhooks/task
POST /api/v1/webhooks/idea
POST /api/v1/webhooks/note
```

## LOCAL_SETUP.md

Explain:

- Install steps
- Environment variables
- Database setup
- Running dev server
- Running dashboard fullscreen
- Localhost API usage

## EXAMPLES.md

Include practical examples:

- Create a task
- Create a project
- Add an idea
- Convert idea to task
- Add note to task
- Get dashboard state
- Log agent action

---

# Webhook / Remote Input Consideration

Beta 1 should be designed so webhooks can be added later.

If easy, add basic webhook endpoints.

If not, create the route structure and docs.

The system should eventually support remote creation of:

- Tasks
- Ideas
- Notes
- Agent updates

But do not expose this publicly without auth.

---

# Visual Design Direction

Use the attached screenshots as inspiration.

Overall desired style:

- Dark mode first
- High contrast
- Futuristic dashboard feel
- Clean cards
- Clear typography
- Neon or accent highlights where appropriate
- Animated but readable
- Smooth transitions
- Visually dense but not cluttered
- Glanceable from across the room
- Strong status indicators
- Good use of progress bars and badges

Do not make it look like a plain admin panel.

Control Panel can be simpler.

Live Dashboard should feel like a command center.

---

# UX Requirements

Important UX details:

- Quick-add should be very fast.
- User should be able to capture an idea in seconds.
- Editing should be simple.
- Search should work across title, description, tags.
- Filters should be obvious.
- Status changes should be one or two clicks.
- Dashboard should require no interaction.
- Dashboard should auto-refresh or receive live updates.
- Data should not disappear accidentally.
- Archive instead of hard delete where possible.

---

# Beta 1 Deliverables

At the end, the project should include:

1. Working local app
2. Control Panel UI
3. Live animated Dashboard UI
4. SQLite database
5. CRUD for projects/tasks/ideas
6. Notes/progress updates
7. Attachments/links support
8. Agent action logging
9. REST API
10. Agent-specific API
11. Dashboard state endpoint
12. Markdown documentation
13. Seed/demo data
14. Setup instructions
15. Clean project structure

---

# Seed Data

Add realistic sample data so the dashboard does not look empty.

Include examples like:

- Build Task Dashboard App
- OpenClaw Agent API
- Mini-home website project
- Home automation idea
- 3D print organizer idea
- Network cleanup task
- Documentation task
- Blocked task waiting on API key
- Urgent task due soon
- Agent action sample logs

---

# Important Implementation Rules

- Use TypeScript where possible.
- Keep code organized.
- Use reusable components.
- Use clean API response structures.
- Validate required fields.
- Use timestamps consistently.
- Do not hard-delete important records unless clearly marked as safe.
- Generate useful documentation, not placeholder docs.
- Make the app actually runnable.
- Include `.env.example`.
- Include setup instructions.
- Include seed script or sample data loader.
- Make dashboard look good even with sample data.
- Do not stop at mockups only. Build functional Beta 1.

---

# Suggested Project Structure

Use something like:

```txt
/
  app/
    dashboard/
    projects/
    tasks/
    ideas/
    activity/
    agent/
    settings/
  components/
    dashboard/
    forms/
    layout/
    cards/
  lib/
    db/
    api/
    validation/
    dashboard/
  prisma/ or db/
  docs/
    README.md
    DATA_MODEL.md
    API.md
    AGENT_API.md
    STATUS_RULES.md
    DASHBOARD.md
    WEBHOOKS.md
    LOCAL_SETUP.md
    EXAMPLES.md
  scripts/
    seed.ts
  .env.example
```

Adjust structure if your chosen framework requires it.

---

# Development Priority Order

Build in this order:

1. Data model
2. Database setup
3. API routes
4. Agent API routes
5. Seed data
6. Control Panel CRUD UI
7. Live Dashboard UI
8. Realtime/dashboard refresh
9. Markdown docs
10. Visual polish

Do not start with animation first. The data and API are the foundation.

---

# Final Output Expected

When finished, provide:

- Summary of what was built
- How to install
- How to run
- Local app URL
- Dashboard URL
- API base URL
- Where the docs are located
- Any known Beta 1 limitations

Remember: this is Beta 1. Make it solid, local, documented, and actually usable.
