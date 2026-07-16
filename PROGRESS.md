# Gordon / OpenClaw Migration Progress Report

**Repository:** Key of Solomon (package name `neondeck`)  
**Branch:** `openclaw`  
**Implementation date:** July 14, 2026 (America/Chicago)  
**Snapshot captured:** July 14, 2026 at 4:48:53 PM CDT (`2026-07-14 16:48:53 -0500`)  
**Starting branch commit:** `eac0977` — July 12, 2026 at 5:25:45 PM CDT  
**Current status:** Repo-side migration complete and verified; authenticated OpenClaw Mac Mini activation remains pending.

---

## Executive summary

This branch began as the task-hierarchy version of Key of Solomon. It already had a strong local-first task/project/idea model, a React control panel and dashboard, SQLite persistence, a generic agent-safe API, one-level subtasks, duplicate-task protection, and a basic approval system. However, the active agent identity and operating documentation were still tied to the retired Hermes runtime. OpenClaw appeared in some examples and seed data, but there was no complete, secure, two-way OpenClaw integration.

The migration completed on July 14, 2026 replaces that Hermes-facing surface with Gordon, the `main` agent on the remote OpenClaw Mac Mini. It preserves Key of Solomon as the single task source of truth and gives the two systems distinct responsibilities:

- Key of Solomon's agent-safe API is Gordon's authoritative read/write control plane.
- OpenClaw's native `/solomon` webhook is the event-driven wakeup plane.
- OpenClaw cron is the scheduled morning and late-day review plane.
- SQLite remains the only durable project/task/idea database.
- There is no custom bridge daemon and no competing OpenClaw task database.

The repo now contains scoped Gordon authentication, richer agent context, agent-safe entity detail endpoints, approval wrappers, evidence-gated completion, persistent reminder metadata, a durable outbound webhook outbox, retry/backoff handling, event coalescing, origin-based loop prevention, connection health UI, and a complete OpenClaw deployment pack.

The local app is currently running and exposed to the private tailnet through Tailscale Serve. The real SQLite database migration has run successfully. Remote activation is intentionally not enabled yet because the Mac Mini's OpenClaw Control UI requires its Gateway token and this MacBook does not have a working SSH key for that machine.

---

## Timeline and reference points

### Repository history before this migration

| Date and time (CDT) | Commit | Milestone |
|---|---|---|
| June 13, 2026, 8:41:29 PM | `8b0361f` | Initial Neondeck repository |
| June 26, 2026, 3:30:48 PM | `c17ea6d` | Beta 2, Key of Solomon branding, dashboard overhaul, and agent docs |
| July 8, 2026, 12:27:52 AM | `54bf625` | Main branch quick-start and operating-guide alignment |
| July 9, 2026, 7:45:48 PM | `470590c` | Active-task dashboard rail |
| July 12, 2026, 5:25:45 PM | `eac0977` | Task hierarchy, subtasks, duplicate detection, and expanded agent API |

At the start of the July 14 migration, `openclaw`, `origin/openclaw`, `codex-dash`, and `origin/codex-dash` all pointed to `eac0977`. The only unrelated worktree item was the pre-existing untracked `brag-output/` directory. It was not modified.

### July 14, 2026 migration session

| Time (CDT) | Event |
|---|---|
| Approximately 4:00 PM | Branch, canonical docs, API routes, UI, database, tests, attached webhook guide, and existing runtime assumptions were inspected. |
| 4:11 PM | The remote OpenClaw overview and `/solomon` route were confirmed reachable over Tailscale. The Mac Mini was online at its tailnet hostname. |
| During implementation | Scoped auth, database migrations, domain-event publishing, webhook outbox/dispatcher, Gordon APIs, UI, docs, tests, and deployment assets were implemented. |
| During verification | The production frontend was rebuilt, backend and integration tests passed, TypeScript checks passed, and the real database migration ran. |
| Before 4:48 PM | Tailscale Serve was enabled on the Key of Solomon MacBook and the tailnet HTTPS health endpoint returned successfully. |
| 4:48:53 PM | This progress snapshot was collected from the running app, real SQLite database, Tailscale, git, and the source tree. |

---

## Where the repository stood before the migration

### Architecture that already existed

Before this work, Key of Solomon was already a local-first, single-user application with:

- Express and TypeScript backend on port `8787`.
- React 18, Vite, Tailwind, and React Router frontend.
- SQLite through `better-sqlite3` with WAL fallback behavior.
- Project, task, idea, note, attachment, approval, action-log, settings, and AI-summary entities.
- A read-only live dashboard with SSE plus polling fallback.
- A control panel, Fast Capture, Agent Center, and dashboard.
- Soft deletion for projects, tasks, and ideas.
- A shared `store.ts` layer used by standard and agent routes.
- A generic `/api/v1/agent` API intended for external automation.

The `openclaw` branch also already included the July 12 task-hierarchy work:

- One-level main-task/subtask hierarchy.
- Atomic agent subtask-plan creation.
- Duplicate task and duplicate subtask-plan protection.
- `source` and derived `subtaskPlanSource` ownership metadata.
- Guarded parent completion while children remain open.
- Fast Capture generation of an optional initial subtask plan.
- Existing tests for task hierarchy, plan ownership, and duplicate prevention.

Those capabilities were kept. They became the foundation for Gordon rather than being replaced.

### Agent integration limitations before the migration

The agent surface was incomplete in several important ways:

1. **Hermes was still the documented runtime.**
   - The canonical brief was `docs/HERMES_AGENT_BRIEF.md`.
   - `AGENTS.md`, `CLAUDE.md`, the root README, and the docs index pointed to it.
   - The task UI displayed agent-created work as coming from Hermes.
   - An agent API test used `Hermes-Test` as its identity.
   - The live database contained seven action rows whose exact `agentName` was the retired identity.

2. **There was no outbound OpenClaw wakeup mechanism.**
   - Key of Solomon supported inbound `/api/v1/webhooks/task`, `/idea`, `/note`, and `/agent-update` routes.
   - Outbound webhooks were documented as future work.
   - No webhook delivery table, queue, dispatcher, retry strategy, or delivery-health UI existed.

3. **Authentication used one full-access token.**
   - `LOCAL_API_TOKEN` protected nearly all API routes.
   - A remote agent would have needed the same broad token used by the local UI and administrative routes.
   - Agent identity came from a request header or body and was not bound to a credential.

4. **Agent reads were not complete enough for metadata-only webhook events.**
   - Gordon could request broad context or the available-task list.
   - There were no dedicated agent-safe detail reads for one task, project, or idea with related notes and attachments.

5. **The reminder model was missing.**
   - `/agent/context/today` did not return waiting tasks, stale tasks, pending approvals, or reminder timestamps.
   - `reminder` was not an agent action type.
   - There was no durable `lastRemindedAt` signal for cooldown decisions.

6. **Approval policy was mostly documentary.**
   - Standard approval routes existed.
   - There were no agent-prefixed approval wrappers for a scoped token.
   - The agent status endpoint did not technically require evidence or an approved action before completion.
   - Idea-to-project conversion and archive restrictions were described in docs but were not fully enforced at the agent route boundary.

7. **OpenClaw was not deployable from this repo.**
   - There was no Gordon bootstrap policy.
   - There was no safe OpenClaw mapping example.
   - There were no exact cron commands, environment instructions, or end-to-end runbook.
   - Tailscale Serve was not configured on this MacBook.

### Attached webhook guide and security correction

The supplied `WEBHOOK_DETAIL.md` documented the live Mac Mini webhook paths and a working `/solomon` mapping. It described the secret path plus Tailscale as the protection layer and showed `allowUnsafeExternalContent: true`.

The implementation deliberately did not perpetuate that weaker configuration. The current OpenClaw contract expects a dedicated hook bearer token, constrained agent/session routing, and unsafe external-content bypass disabled. The secret hook URL and bearer token are therefore environment-only and are not copied into this repository or this report.

---

## Decisions locked for the migration

The selected operating profile is **proactive balanced**:

- Gordon triages all open work.
- Gordon automatically executes existing agent candidates and clearly machine-doable subtasks.
- Gordon can create a sensible one-level subtask plan when none exists.
- Existing safety and approval boundaries remain in force.
- Gordon sends a morning review at 8:00 AM America/Chicago.
- Gordon sends a late-day review at 5:30 PM America/Chicago.
- Urgent, blocked, approval-resolution, and integration-failure events are event-driven.
- Direct per-item reminders have a 24-hour cooldown unless the item's state worsens.
- Stale work means no update for 14 days.
- User-facing completions, blockers, approvals, and reminders go to Gordon's normal owner chat.
- Full detail and evidence remain in Key of Solomon's notes and action log.

---

## Changes made

## 1. Gordon identity and Hermes removal

The retired identity was removed from tracked source, tests, UI, documentation, seed action identities, and the compiled frontend bundle.

Changes include:

- Renamed `docs/HERMES_AGENT_BRIEF.md` to `docs/GORDON_OPENCLAW_AGENT_BRIEF.md`.
- Updated `AGENTS.md`, `CLAUDE.md`, `README.md`, and `docs/README.md` to use the new brief.
- Replaced runtime ownership language with Gordon/OpenClaw language.
- Changed the task-source UI label from the retired runtime to Gordon.
- Changed the dashboard agent heading to `Gordon / OpenClaw`.
- Changed the Agent Center title and description to Gordon/OpenClaw.
- Changed the hierarchy test agent identity to `Gordon-Test`.
- Changed demo action identities from generic OpenClaw naming to Gordon where they represent the agent identity.
- Added an idempotent database migration that changes exact legacy system `agentName` fields to `Gordon` in `agent_actions` and `agent_approvals`.
- Preserved user-authored task titles, descriptions, notes, and historical prose.
- Deleted no database records.

The final source scan on July 14, 2026 returned zero retired-runtime references, including the rebuilt production bundle.

## 2. Scoped Gordon API authentication

`GORDON_API_TOKEN` was added as a separate credential.

Behavior now is:

- `LOCAL_API_TOKEN` retains full local application/API access.
- `GORDON_API_TOKEN` is accepted only for paths under `/api/v1/agent`.
- A Gordon token used against settings, import/export, integrations, or standard CRUD receives `403 FORBIDDEN`.
- The credential binds audit identity to `Gordon`.
- A conflicting `X-Agent-Name` header or body field cannot spoof a different identity.
- The older raw `/agent/actions` compatibility route also binds the scoped token to Gordon.
- The remote agent never needs `LOCAL_API_TOKEN`.

New environment variable:

```dotenv
GORDON_API_TOKEN=<long-random-agent-only-token>
```

No real token value is committed or reproduced here.

## 3. Expanded Gordon context and safe reads

`GET /api/v1/agent/context/today` now includes:

- Due-today tasks.
- Overdue tasks.
- Urgent tasks.
- Blocked tasks.
- Waiting tasks.
- Stale tasks whose `updatedAt` is at least 14 days old.
- In-progress tasks.
- Agent candidates.
- Active projects.
- Recent notes.
- Pending approvals.
- Task hierarchy counts and plan source.
- `lastRemindedAt` derived from reminder action logs.

New agent-safe detail routes:

- `GET /api/v1/agent/tasks/:id`
  - Task data.
  - Parent/subtask hierarchy.
  - Notes.
  - Attachments.
  - `lastRemindedAt`.
- `GET /api/v1/agent/projects/:id`
  - Project data, notes, and attachments.
- `GET /api/v1/agent/ideas/:id`
  - Idea data, notes, and attachments.

These endpoints allow the webhook payload to remain small and safe: it can carry only an entity ID, while Gordon fetches authoritative content through the scoped API.

## 4. Agent-prefixed approval workflow

Gordon no longer needs access to the standard approval namespace.

Added:

- `POST /api/v1/agent/approvals`
- `GET /api/v1/agent/approvals/pending`
- `GET /api/v1/agent/approvals/:id`

Approval creation uses Gordon's token-bound identity. Approval resolution still happens from the local user-facing Agent Center through the full-access approval routes. Approval resolution emits an immediate wake event so Gordon can resume the gated action.

## 5. Evidence-gated completion and enforced safety

The agent status route now distinguishes verified self-completion from user-approved completion.

Gordon may complete work without a separate approval only when it sends:

```json
{
  "status": "done",
  "reason": "Implemented and verified the requested result",
  "completedByAgent": true,
  "evidence": "Concise description of the observed proof"
}
```

In that case:

- Existing parent/subtask completion rules still apply.
- The normal status-change note is created.
- A separate progress note records the completion evidence.
- The status-change action is logged under Gordon.

If Gordon did not perform and verify the complete result, the request must include an approved `mark_complete` approval ID.

Additional enforcement:

- Agent archive requests require an approved `archive` approval ID.
- Agent idea-to-project conversion requires an approved `convert_idea_to_project` approval ID.
- User-authored text remains outside Gordon's direct rewrite surface.
- No hard-delete route was added to the agent API.

## 6. Reminder action model

`reminder` was added to the recognized agent action types.

Gordon logs reminders through `/agent/actions/log` instead of adding noisy reminder notes to every task. Task context and task detail derive `lastRemindedAt` from the most recent reminder action targeted at that task.

This provides durable cooldown state across:

- Agent restarts.
- App restarts.
- OpenClaw session changes.
- Morning and late-day cron executions.

The operating policy instructs Gordon not to repeat a direct reminder within 24 hours unless status, due date, or priority worsens.

## 7. Shared domain-event publisher

The existing SSE `broadcast` behavior was promoted into a shared domain-event publisher while keeping the old exported name for compatibility.

For every relevant mutation, the publisher now:

1. Sends the existing SSE event to dashboard/control-panel clients.
2. Determines whether the change is eligible for an OpenClaw wake.
3. Rejects Gordon/OpenClaw/agent-originated events before they enter the webhook queue.
4. Detects urgent or blocked task/project state from SQLite.
5. Marks approval resolutions as immediate.
6. Enqueues only safe metadata for eligible user-originated changes.

Eligible entity families are task, project, idea, and approval. Notes, attachments, settings, and agent action log writes do not independently wake Gordon.

## 8. Persistent OpenClaw webhook outbox

A new SQLite table, `webhook_outbox`, records outbound delivery state.

Each row stores:

- Unique event ID.
- Event type.
- Entity type and entity ID.
- Metadata-only JSON payload.
- Normal or immediate priority.
- `queued`, `delivering`, `delivered`, or `failed` status.
- Attempt count.
- Next eligible attempt timestamp.
- Created and delivered timestamps.
- Redacted last error.
- Deduplication key.

Important guarantees:

- User-authored titles, descriptions, notes, and attachments are not copied into webhook payloads.
- API tokens and the full hook URL are never written into the outbox.
- Normal duplicate events are coalesced while queued.
- Immediate events are processed before ordinary events.
- Transient network errors, HTTP `408`, `425`, `429`, and server errors retry.
- Retry delays progress through 10 seconds, 1 minute, 5 minutes, 30 minutes, and 1 hour.
- The maximum delivery attempt count is five.
- Permanent client failures become visible `failed` rows rather than retrying forever.
- Rows left as `delivering` by an interrupted process return to `queued` on startup.
- The dispatcher drains up to ten due events per cycle.
- The dispatcher runs every five seconds while the server is active.

## 9. OpenClaw connection configuration

Environment-only configuration was added:

```dotenv
OPENCLAW_WEBHOOK_ENABLED=false
OPENCLAW_SOLOMON_WEBHOOK_URL=
OPENCLAW_HOOK_TOKEN=
```

The intended production state uses:

- The full existing tailnet `/solomon` destination in `OPENCLAW_SOLOMON_WEBHOOK_URL`.
- A dedicated OpenClaw hook bearer token in `OPENCLAW_HOOK_TOKEN`.
- `OPENCLAW_WEBHOOK_ENABLED=true` only after both machines are configured consistently.

The status API and UI expose only the destination host, never the full path or bearer token.

## 10. Integration status and test API

Added full-local-token-only endpoints:

- `GET /api/v1/integrations/openclaw/status`
- `POST /api/v1/integrations/openclaw/test`

Status returns:

- Enabled state.
- Configured state.
- Masked destination host.
- Queued/delivering/delivered/failed counts.
- Latest event metadata and redacted error.

The test route queues a unique immediate metadata-only event and immediately asks the dispatcher to process due work.

The scoped Gordon token cannot use these administrative integration endpoints.

## 11. Agent Center and dashboard UI

The React UI now includes:

- `Gordon / OpenClaw` Agent Center title.
- OpenClaw connection readiness badge.
- Masked destination hostname.
- Queued, delivered, and failed delivery counts.
- Latest delivery event, status, relative time, and safe error.
- A `Send test event` control that is disabled until the integration is enabled and configured.
- Reminder action styling in the action feed.
- Gordon task-source label.
- Gordon/OpenClaw dashboard agent heading.
- Settings copy explaining that Gordon has a separate `/agent`-only token.

The production Vite bundle was rebuilt. The previous hashed JavaScript asset was removed and replaced by the newly generated bundle.

## 12. Gordon operating brief

`docs/GORDON_OPENCLAW_AGENT_BRIEF.md` now defines:

- Gordon's mission and source-of-truth order.
- The autonomous work loop.
- Task decomposition and duplicate prevention.
- Embedded AI versus Gordon ownership.
- Safe and approval-gated actions.
- Proactive balanced morning and late-day cadence.
- Reminder logging and cooldown rules.
- Prompt-injection/content safety boundary.
- Verified self-completion contract.

## 13. OpenClaw deployment pack

Added `integrations/openclaw/` with:

### `integrations/openclaw/README.md`

Contains:

- Key of Solomon host environment setup.
- Tailscale Serve instructions.
- Tailnet health and scoped-context smoke tests.
- Mac Mini OpenClaw configuration procedure.
- Live schema and doctor checks.
- Gateway restart and RPC health verification.
- Exact morning and late-day cron creation commands.
- Manual cron run/history commands.
- Supervised end-to-end task proof.

### `integrations/openclaw/GORDON.md`

Contains the OpenClaw-facing policy to merge into Gordon's workspace `AGENTS.md` so it loads as bootstrap policy.

It instructs Gordon to:

- Read API base/token from private runtime environment.
- Use only scoped agent routes.
- Fetch entity details after webhook wakes.
- Treat task content as untrusted data.
- Triage and execute safe machine-doable work.
- Reuse existing task and subtask plans.
- Add evidence and action logs.
- Enforce reminders and approval gates.
- Notify the owner concisely.

### `integrations/openclaw/openclaw.mapping.example.json5`

Provides a safe mapping with:

- `agentId: "main"`.
- Static `sessionKey: "hook:solomon"`.
- `wakeMode: "now"`.
- `deliver: false`.
- `allowRequestSessionKey: false`.
- `allowedAgentIds: ["main"]`.
- `allowUnsafeExternalContent: false`.
- Metadata-only `{{json}}` forwarding.
- Explicit instruction to fetch authoritative state through the API.

The secret machine-specific base path and token are placeholders and are not committed.

## 14. OpenClaw cron plan

The deployment pack defines two persistent isolated Gordon jobs in `America/Chicago`:

- **8:00 AM daily — Solomon morning review**
  - Due today.
  - Overdue.
  - Blocked.
  - Stale.
  - Pending approvals.
  - Active agent work.
  - Best safe executable next steps.

- **5:30 PM daily — Solomon late-day review**
  - Unfinished due-today work.
  - Stalled in-progress work.
  - New blockers.
  - Verified completions.

The jobs use isolated sessions to avoid bloating Gordon's main conversation and use OpenClaw's announce delivery behavior for the configured owner route.

## 15. Tailscale API exposure

Before the migration, `tailscale serve status` reported no Serve configuration.

On July 14, 2026, Tailscale Serve was enabled with:

```bash
tailscale serve --bg 8787
```

Current private tailnet route:

```text
https://codys-macbook-pro.tail8e0a20.ts.net/
└── proxy http://127.0.0.1:8787
```

The tailnet HTTPS health request succeeded at the final snapshot. This exposes the running app to devices on the private tailnet without exposing it publicly through Tailscale Funnel.

---

## Testing and verification

## Automated backend tests

Final test run on July 14, 2026:

```text
tests:     10
passed:    10
failed:     0
cancelled:  0
skipped:    0
todo:       0
```

New integration coverage verifies:

1. Gordon token can access agent context.
2. Gordon token receives `403` outside `/agent`.
3. Full local token retains settings access.
4. Scoped token binds both safe and legacy action-log routes to Gordon.
5. Agent approval creation/list/detail routes work under the scoped token.
6. Completion without evidence or approval is rejected.
7. Verified Gordon completion succeeds and records evidence.
8. Reminder actions populate `lastRemindedAt`.
9. User-originated events deliver only metadata.
10. Webhook Authorization uses the dedicated hook token.
11. Task titles, descriptions, and tokens are absent from webhook payloads.
12. Gordon-originated writes do not create webhook loops.
13. HTTP 500 responses enter retry state.
14. Retried events can later deliver successfully.
15. Permanent HTTP 401 responses become visible failures.

Existing hierarchy tests continue to verify:

- Existing database migration for `parentTaskId`.
- One-level hierarchy enforcement.
- Derived subtask progress.
- Guarded parent completion.
- AI subtask normalization and limits.
- Fast Capture subtask creation.
- Agent duplicate and plan-ownership rules.

## Static and build checks

Completed successfully:

- `npx tsc --noEmit` for the backend.
- Frontend TypeScript compilation.
- Vite production build.
- `git diff --check`.
- Full tracked-tree scan for the retired runtime name.
- Check that `brag-output/` does not appear in tracked diffs.

The frontend dependency audit reported zero known vulnerabilities. npm printed informational allow-scripts warnings for `esbuild` and `fsevents`; these did not prevent the build.

## Live checks

At `2026-07-14 16:48:53 CDT`:

- Local server health: success.
- App name: Key of Solomon.
- Frontend mode: React production build.
- Tailnet HTTPS health: success.
- Tailscale Serve: active, tailnet only.
- Real `webhook_outbox` table: present.
- Exact legacy action identities: `0`.
- Gordon action identities: `7`.
- Current outbox queued/delivered/failed rows: none, because production webhook dispatch remains disabled until remote authentication is configured.

---

## Current repository state

### Completed repo-side state

- The new API, outbox, dispatcher, UI, tests, docs, and deployment pack are present in the worktree.
- The production frontend bundle has been rebuilt.
- The real SQLite migration has executed successfully.
- Key of Solomon is running locally.
- Tailscale Serve is running in the background.
- The app is reachable through the private tailnet HTTPS hostname.
- No data was hard-deleted.
- No unrelated `brag-output/` content was touched.

### Git state

As of the snapshot, the migration is **not committed**. The branch pointer remains at `eac0977` while the implementation exists as modified, deleted, and untracked worktree files.

Notable new files include:

- `PROGRESS.md`
- `docs/GORDON_OPENCLAW_AGENT_BRIEF.md`
- `integrations/openclaw/README.md`
- `integrations/openclaw/GORDON.md`
- `integrations/openclaw/openclaw.mapping.example.json5`
- `server/src/openclaw.ts`
- `server/src/routes/integrations.ts`
- `server/test/openclaw-integration.test.ts`
- The new hashed frontend production JavaScript asset.

Notable removed/replaced files include:

- `docs/HERMES_AGENT_BRIEF.md`, replaced by the Gordon/OpenClaw brief.
- The previous hashed frontend JavaScript bundle, replaced by the new production build.

### Runtime state

The local Key of Solomon server was running on port `8787` at the snapshot. Tailscale Serve was proxying tailnet HTTPS traffic to `127.0.0.1:8787`.

Integration status intentionally reports:

```json
{
  "enabled": false,
  "configured": false,
  "queue": {
    "queued": 0,
    "delivering": 0,
    "delivered": 0,
    "failed": 0
  }
}
```

This is the safe state until the Mac Mini's hook token and mapping are installed.

---

## What remains to finish remote activation

The repo and Key of Solomon host are ready. The remaining work is entirely on the OpenClaw Mac Mini plus matching private environment values.

### Confirmed blocker on July 14, 2026

- The OpenClaw overview is reachable through Tailscale.
- The Control UI opens but displays the Gateway connection screen.
- It requires the Mac Mini's Gateway token or a tokenized dashboard URL.
- SSH to the Mac Mini is reachable but rejected this MacBook's authentication key.
- No OpenClaw CLI is installed on this MacBook for remote Gateway administration.

Because those credentials were unavailable, the implementation did not attempt to weaken the remote hook back to path-only authentication and did not enable outbound production delivery prematurely.

### Safest continuation procedure

1. On the Mac Mini, run:

   ```bash
   openclaw dashboard
   ```

2. Open the resulting tokenized dashboard URL in the in-app browser, or provide working SSH authorization for the Mac Mini.
3. Merge `integrations/openclaw/openclaw.mapping.example.json5` into the live OpenClaw config while preserving the machine's existing secret hook base path.
4. Create a dedicated hook token that is not the Gateway token.
5. Merge `integrations/openclaw/GORDON.md` into Gordon's workspace `AGENTS.md`.
6. Configure Gordon's private runtime with:

   ```text
   SOLOMON_API_BASE=https://codys-macbook-pro.tail8e0a20.ts.net/api/v1
   SOLOMON_AGENT_TOKEN=<matching scoped Gordon token>
   ```

7. Put matching private values in Key of Solomon's ignored `.env`:

   ```dotenv
   GORDON_API_TOKEN=<matching scoped Gordon token>
   OPENCLAW_WEBHOOK_ENABLED=true
   OPENCLAW_SOLOMON_WEBHOOK_URL=<complete secret /solomon URL>
   OPENCLAW_HOOK_TOKEN=<matching dedicated hook token>
   ```

8. Validate and restart OpenClaw:

   ```bash
   openclaw config schema >/dev/null
   openclaw doctor
   openclaw gateway restart
   openclaw gateway status --require-rpc
   ```

9. Restart Key of Solomon so it reads the new environment.
10. Send a test event from Agent Center and confirm `delivered` status.
11. Confirm Gordon receives the event in `hook:solomon` and calls the scoped API.
12. Create and supervise the two cron jobs from `integrations/openclaw/README.md`.
13. Run one real safe task round trip:
    - Create or select an agent-candidate task.
    - Wake Gordon.
    - Fetch authoritative details.
    - Set `in_progress` with a reason.
    - Execute the work.
    - Add progress/evidence.
    - Complete with verified evidence.
    - Confirm dashboard and owner-chat notification.

---

## Final state summary

As of July 14, 2026 at 4:48:53 PM CDT, Key of Solomon has been transformed from a generic agent-safe task manager with a retired Hermes-facing brief into a Gordon/OpenClaw-ready command center with a clear, secure, and auditable division of responsibility.

The code, schema, UI, documentation, tests, local migration, and private tailnet API exposure are complete. The production webhook remains disabled by design until authenticated access to the Mac Mini is available. Once the safe mapping, dedicated hook token, Gordon bootstrap policy, and cron jobs are installed remotely, no further architectural work should be required for the first supervised end-to-end run.

---

# Interactive Dashboard, Gordon Chat, Approvals, and Notifications

## Implementation checkpoint — July 15, 2026 at 7:34:41 PM CDT

This section records the second major Gordon/OpenClaw implementation phase. It
is additive to the July 14 migration history above and describes the repository
state before this phase, the work completed on July 15, and the remaining live
deployment steps.

## Where this phase started

At the beginning of July 15, the repository already had the durable Gordon
control-plane and webhook-wakeup architecture from the first migration:

- SQLite remained the only authoritative task store.
- Gordon had a separately scoped `/api/v1/agent/**` token and an audited identity.
- OpenClaw's native `/solomon` webhook was backed by a persistent outbox,
  coalescing, origin-loop prevention, bounded retries, and redacted status.
- Agent-safe context, detail, subtask, approval-wrapper, reminder, and
  evidence-gated completion routes were implemented.
- The dashboard and Agent Center showed Gordon/OpenClaw identity and webhook
  delivery health.
- The deployment pack documented the safe hook mapping and scheduled reviews.

The operational UI still had important limits:

1. Small dashboard labels, metadata, and muted completed work were difficult to
   read on the large display shown in the supplied screenshots.
2. Dashboard rows looked like entities but were not consistently clickable,
   keyboard navigable, bookmarkable, or Back-button aware.
3. Pending Approvals exposed too little human context and too much implementation
   payload detail to work as an efficient safety boundary.
4. Agent Center had no direct conversation surface for Gordon.
5. Gordon completions and blockers appeared in dashboard state but did not create
   durable, actionable in-app alerts.
6. The existing status presentation risked making a historical activity record
   look like a live OpenClaw presence indicator.

## Dashboard readability and navigation

The dashboard retains the existing retro-futuristic neon composition, palette,
font pairing, glow treatment, independent scrolling, and reduced-motion rules.
The implementation changes information density rather than redesigning the page.

Added reusable typography treatments:

- Entity titles use `clamp(15px, 0.78vw, 16px)`.
- Metadata, statuses, timestamps, and due labels use
  `clamp(12px, 0.64vw, 13px)`.
- Completed task titles remain struck through but now use readable muted
  contrast instead of disappearing into the card background.
- One-line truncation and native title tooltips preserve space for long names.
- The large-display grid now targets a left rail near 340px, a fluid command
  board of at least 600px, and a right rail near 380px, with responsive collapse
  rules for narrower viewports.

Entity-backed content is now navigable from the dashboard and Agent Center:

- Active project cards.
- The active-task rail.
- All six Task Command Board columns and the Active Tasks strip.
- Upcoming Deadlines.
- Ideas.
- Recent Activity when its parent entity is known.
- Gordon actions when `targetType` and `targetId` are present.
- Ticker items with entity references.
- Agent-candidate tasks in Agent Center.

Stable control-panel routes were added:

- `/app/tasks/:taskId`
- `/app/projects/:projectId`
- `/app/ideas/:ideaId`

Each existing detail modal reads the route parameter and fetches the entity
directly. This makes hard refreshes and bookmarks reliable. Closing a directly
opened modal returns to the relevant list; normal dashboard navigation preserves
browser Back behavior. KPI tiles and command-board headings link to URL-driven
task views such as `open`, `due-today`, `overdue`, and `blocked`.

The dashboard remains mutation-free. It now navigates into the existing editable
Control Panel detail surfaces instead of becoming a second editing interface.

## Agent Center operating model

Agent Center was reorganized into an operational sequence:

1. Webhook and direct-chat connection health.
2. Gordon recorded activity and Pending Approvals.
3. A full-width persistent Chat with Gordon surface.
4. Agent-candidate work.
5. AI summaries.
6. Recent Gordon actions and resolved approval history.

The old generic `IDLE` presentation was replaced with evidence-based states:

- `ACTIVE` means a recorded Gordon action occurred in the last five minutes.
- `NEEDS ATTENTION` means approval decisions are waiting.
- `ERROR` reflects the latest recorded integration/action failure.
- `QUIET` means no recent recorded activity.

The page always labels the time of the last recorded action. It does not claim
that OpenClaw is currently online merely because historical activity exists.

## Effective Pending Approvals

Approval records now carry a server-generated safe target snapshot containing:

- Entity type and ID.
- Current title.
- Current status.
- Whether the target still exists.

The interface presents each request as a plain-language proposed action, shows
the affected entity as a deep link, explains Gordon's reason, and summarizes
the proposed field changes. Raw payload details are collapsed behind an explicit
preview control.

Approval decisions now support:

- An optional decision note.
- Quick rejection reasons: `Not now`, `Wrong action`, and `Needs changes`.
- Disabled controls while the request is resolving.
- Server-side protection against double resolution.
- Persistent `resolutionNote` storage through an idempotent schema migration.
- The ten most recent decisions below the pending queue.
- A compact `Guardrails active` explanation when no decision is pending.

Approval creation and resolution publish named SSE events so the page updates
without a manual refresh. Resolution still queues an immediate ID-only Gordon
wake event, allowing the agent to continue the exact gated action through its
scoped API without waiting for a poll cycle.

## Direct streaming Chat with Gordon

Key of Solomon now has a server-side proxy for OpenClaw's OpenAI-compatible Chat
Completions endpoint. The browser never receives the Gateway credential.

The backend fixes all privileged routing choices:

- Model: `openclaw/main`.
- Stable user/session key: `key-of-solomon:gordon-main`.
- Message channel: `key-of-solomon`.
- Streaming: enabled.
- Browser-selected models, agents, system prompts, tools, and headers: rejected
  by design because they are not part of the request contract.

The private configuration is:

```dotenv
OPENCLAW_GATEWAY_CHAT_ENABLED=false
OPENCLAW_GATEWAY_BASE_URL=https://cojovis-mac-mini-1.tail8e0a20.ts.net
OPENCLAW_GATEWAY_TOKEN=
```

The Gateway token is distinct from both `GORDON_API_TOKEN` and
`OPENCLAW_HOOK_TOKEN`. It is never returned in integration status, webhook
payloads, browser bundles, documentation examples, or error details.

Chat behavior includes:

- An 8,000-character user-message limit.
- One active upstream turn at a time with `409 CHAT_BUSY` for overlap.
- A five-minute upstream timeout.
- Immediate persistence of the user message.
- Periodic assistant-output checkpoints while streaming.
- Persisted completed and failed assistant rows.
- Startup recovery that changes abandoned `streaming` rows to `failed`.
- Retry through the failed assistant message without duplicating the visible
  user turn.
- Normalized downstream SSE events: `message`, `delta`, `done`, and `error`.

The interface provides a scrollable transcript, distinct Cody/Gordon styling,
typing state, Enter-to-send, Shift+Enter for a new line, Retry for failed turns,
and setup guidance when chat is disabled. This conversation table stores chat
history only; it is not a competing task database. Any task-system work Gordon
performs after a chat command must still use `/api/v1/agent/**` and the existing
approval gates.

## Persistent notifications and pop-ups

A new `notifications` table stores type, severity, concise title/body, entity
target, actor, dedupe key, creation time, and read time. Notifications are never
hard-deleted.

Notifications are generated for:

- A task Gordon completed and verified with evidence.
- A task Gordon marked blocked.
- A new approval request.
- A terminal webhook/integration failure.
- A completed Gordon chat reply.

Dedupe keys prevent repeated alerts for the same transition. New alerts publish
`notification_created` over SSE and feed the global notification layer.

The global UI now provides:

- No more than three simultaneous pop-up cards.
- Eight-second automatic dismissal.
- Severity and Gordon/entity context.
- Dismiss plus `View task` or `Review approval` actions when applicable.
- `aria-live`, keyboard focus, and reduced-motion support.
- An unread bell and persistent history in both the Control Panel quick-add bar
  and dashboard header.
- Read-one and read-all operations without deleting history.

Optional browser notifications are disabled by default. Permission is requested
only after an explicit Settings click. A browser alert is shown only when the
document is hidden, permission is granted, and the related detail/chat view is
not already visible. Clicking focuses the Key of Solomon tab and follows the
stable entity route. Fully closed background push is intentionally outside this
iteration.

## New and extended interfaces

Added full-token-only routes:

- `GET /api/v1/integrations/openclaw/chat/messages?limit=100`
- `POST /api/v1/integrations/openclaw/chat/stream`
- `GET /api/v1/notifications?limit=50&unread=true|false`
- `POST /api/v1/notifications/:id/read`
- `POST /api/v1/notifications/read-all`

OpenClaw integration status now includes a masked chat section with only
enabled/configured state, destination hostname, and the latest redacted outcome.
The Gordon-scoped token remains rejected on all integration and notification
management routes.

Added database structures and migrations:

- `agent_approvals.resolutionNote`.
- `gordon_chat_messages` with conversation, reply, status, redacted-error, and
  timestamp fields.
- `notifications` with a unique dedupe key and read-state indexes.
- Startup recovery for interrupted chat streams.

The shared SSE layer now publishes domain-specific approval and notification
events while preserving the existing `data-changed` behavior used throughout
the application.

## Security boundary after this phase

The final integration has three separate, intentionally non-interchangeable
credentials and responsibilities:

| Surface | Credential | Purpose |
|---|---|---|
| Key of Solomon agent API | `GORDON_API_TOKEN` | Scoped task reads/writes and approval wrappers |
| OpenClaw `/solomon` hook | `OPENCLAW_HOOK_TOKEN` | Metadata-only asynchronous Gordon wakeups |
| OpenClaw Gateway chat | `OPENCLAW_GATEWAY_TOKEN` | User-initiated owner conversation with full Gordon abilities |

Only the Key of Solomon backend can use the Gateway token. The browser cannot
choose a different agent or widen Gordon's scope. Webhook payloads remain ID-only
and never include notification text, chat content, task descriptions, or secrets.

## Verification added in this phase

Backend integration coverage now verifies:

- Idempotent schema creation for chat, notifications, and approval notes.
- Full-token chat access and Gordon-token rejection.
- Fixed OpenClaw agent, session routing, and message channel.
- Streaming parsing, checkpointing, persistence, retry state, concurrency,
  input limits, and secret redaction.
- Approval enrichment, decision-note persistence, double-resolution protection,
  and immediate resolution events.
- Notification creation, deduplication, read/read-all behavior, completion
  generation, and terminal integration failure generation.

Frontend coverage now verifies:

- Stable entity-link construction.
- Dashboard entity links.
- Hard-refresh task detail routing.
- Persisted/streaming Gordon chat rendering.

## Deployment state at this checkpoint

All repository-side code and configuration examples required for the feature are
present. Direct chat remains disabled by default until the OpenClaw Mac Mini has
its Chat Completions endpoint enabled and Key of Solomon receives a private
Gateway token. Browser notifications also remain disabled until the user grants
permission from Settings.

The remaining remote activation steps are:

1. Enable `gateway.http.endpoints.chatCompletions.enabled` in the live Mac Mini
   OpenClaw configuration.
2. Keep that Gateway private to Tailscale.
3. Set the three `OPENCLAW_GATEWAY_*` values in Key of Solomon's ignored `.env`.
4. Restart both sides and confirm masked webhook/chat health in Agent Center.
5. Run one supervised chat turn and one supervised task completion round trip.
6. Confirm exactly one completion pop-up, one history entry, and correct entity
   deep-link behavior.

The application is not intended to remain running as part of repository work.
Any local server started for acceptance testing must be stopped after the test.
