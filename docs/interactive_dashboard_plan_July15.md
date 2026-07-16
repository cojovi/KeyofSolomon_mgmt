Interactive Dashboard, Gordon Chat, Approvals, and Notifications
Summary
Preserve the existing retro-futuristic neon design while turning the dashboard and Agent Center into a more useful operational cockpit:
Increase the small text identified in the screenshots without increasing card density.
Make every entity-backed dashboard item navigable to a stable task, project, or idea detail URL.
Strengthen Pending Approvals as the safety boundary between Gordon’s autonomy and user control.
Add persistent, streaming “Chat with Gordon” using OpenClaw’s direct Gateway API and Gordon’s full configured abilities.
Add actionable in-app completion pop-ups, notification history, and optional browser notifications.
The Agent Center’s functional purpose will be made explicit:
Connection health confirms whether the webhook and chat paths are usable.
Gordon status shows recorded activity without falsely claiming live presence.
Agent candidates show work Gordon is eligible to handle.
Pending Approvals hold risky a reviewed.
Chat provides a direct command and conversation surface.
Recent actions and notifications provide the audit trail.
UX and Navigation Changes
Dashboard readability
Add dashboard typography tokens:Item titles: clamp(15px, 0.78vw, 16px).
Metadata, timestamps, statuses, and due labels: clamp(12px, 0.64vw, 13px).

Apply them to Task Command Board rows, Active Tasks, Done Today, Gordon activity, Upcoming Deadlines, Ideas, Recent Activity, and AI Insight.
Increase Done Today contrast from extremely faint to readable muted text while retaining the line-through treatment.
Prevent crowding with one-line truncation, tooltips for clipped titles, slightly tighter metadata gaps, and a responsive dashboard grid using approximately 340px / minmax(600px, 1fr) / 380px at large display sizes.
Preserve the current palette, typography pairing, glow effects, independent scrolling, and reduced-motion behavior.
Stable entity navigation
Add routes:
/app/tasks/:taskId
/app/projects/:projectId
/app/ideas/:ideaId
The existing detail modals will read the route parameter, fetch the requested entity directly, and open correctly after refresh or from a bookmark. Browser Back returns to the dashboard; closing a directly opened modal returns to its entity list.
Make these dashboard surfaces semantic, keyboard-accessible links:
Active Projects
Active Task rail cards
Every task in all six command-board columns
Upcoming Deadlines
Ideas
Recent Activity through its parent entity
Gordon actions when targetType and targetId exist
Ticker items with entity references
Agent-candidate tasks in Agent Center
Column headings, counts, “+N more,” and KPI tiles navigate to URL-driven filtered list views such as ?view=due-today, ?view=overdue, ?view=open, or ?status=blocked. Empty-state labels remain non-interactive.
Use visible hover, focus, and active treatments; preserve minimum 44px touch targets where possible.
Agent Center, Approvals, and Chat
Agent Center layout
Reorganize the page in this order:
OpenClaw webhook and chat connection health.
Gordon activity/status and Pending Approvals.
Full-width Chat with Gordon.
Agent-candidate tasks.
AI summaries.
Recent Gordon actions and resolved approvals.
Replace misleading “IDLE” semantics with:
ACTIVE — recorded Gordon activity within five minutes.
NEEDS ATTENTION — pendinexist.
ERROR — latest integration/action state is an error.
QUIET — no recent recorded activity.
Always show “Last recorded action” so this is not presented as a realtime OpenClaw presence indicator.
Effective Pending Approvals
Enrich approval responses with a safe target snapshot containing entity type, ID, title, status, and existence.
Present each request as a plain-language action:What Gordon wants to do.
Which entity it affects.
Gordon’s reason.
The proposed field changes.
How long it has been waiting.

Keep payload details collapsed by default, with an expandable change preview instead of raw JSON.
Make the target title a deep link.
Add optional decision notes and quick rejection reasons such as “Not now,” “Wrong action,” and “Needs changes.”
Add idempotent resolutionNote storage to agent_approvals.
Continue resolving approvals with one informed Approve or Reject action; disable controls while resolving and protect against dorve immediate ID-only webhook wakeup when an approval is resolved so Gordon can continue without polling delay.
Show the ten most recently resolved approvals below the pending queue.
When no approvals are pending, show a compact “Guardrails active” explanation and recent decisions instead of a large empty panel.
Refresh approvals from SSE rather than requiring manual Refresh.
Direct streaming Chat with Gordon
Use OpenClaw’s OpenAI-compatible Chat Completions endpoint. It is disabled by default and its bearer credential represents full owner/operator access, so it must remain server-only and tailnet-only, as required by the official OpenClaw Gateway contract.
Add private configuration:
OPENCLAW_GATEWAY_CHAT_ENABLED=false
OPENCLAW_GATEWAY_BASE_URL=https://cojovis-mac-mini-1.tail8e0a20.ts.net
OPENCLAW_GATEWAY_TOKEN=
Enable gateway.http.endpoints.chatCompletions.enabled on the Mac Mini.
Never send the Gateway token to the browser, logs, integration status, webhook payloads, or documentation.
Key of Solomockend will proxy only the fixed Gordon target:model: "openclaw/main"
user: "key-of-solomon:gordon-main" for stable session continuity
x-openclaw-message-channel: "key-of-solomon"
stream: true

Do not permit browser-selected agents, models, system messages, headers, or tools.
Gordon retains his full existing OpenClaw abilities. Key of Solomon changes must still use the scoped Solomon API and existing approval gates.
Limit messages to 8,000 characters, allow one active chat turn at a time, use a five-minute upstream timeout, and return 409 CHAT_BUSY for concurrent sends.
Persist one simple conversation in SQLite. No multi-thread UI and no hard-delete/clear action.
Store user messages immediately and checkpoint streaming assistant output periodically so navigation does not lose a reply.
Mark interrupted streams as failed on restart and provide Retry without duplicating the visible user message.
The UI will include:Scrollable persisted transcript.
Distinct Cody/Gordon message styling.
Streaming response text and typing state.
Enter to send and Shift+Enter for a new line.
Retry for failed turns.
Connection-disabled state with actionable setup guidance.

API, Data, and Notification Changes
Chat interfaces
Add full-token-only endpoints:
GET /api/v1/integrations/openclaw/chat/messages?limit=100
POST /api/v1/integrations/openclaw/chat/stream
The streaming endpoint returns normalized SSE events:
message — persisted user and assistant message IDs.
delta — assistant text increment.
done — completed persisted assistant message.
error — redacted failure code and retryable state.
Add GordonChatMessage with conversation ID, role, content, status, reply reference, redacted error, and timestamps.
Extend OpenClaw integration status with a masked chat section containing enabled/configured state, destination hostname, and latest success/failure—never credentials.
Persistent notifications
Add a notifications table with:
d severity
Title and concise body
Target type and target ID
Actor
Dedupe key
Created timestamp
Read timestamp
Create notifications for:
Gordon completing and verifying a task.
Gordon blocking a task.
New approval requests.
Terminal webhook/integration failures.
Completed Gordon chat replies.
Do not create duplicate notifications for the same transition.
Add:
GET /api/v1/notifications?limit=50&unread=true|false
POST /api/v1/notifications/:id/read
POST /api/v1/notifications/read-all
SSE event notification_created
Upgrade the existing toast provider into a global notification layer:
Stack no more than three pop-ups.
Auto-dismiss after eight seconds.
Include severity icon, Gordon/task context, Dismiss, and “View task” or “Review approval” action.
Use aria-live, keyboard focus support, and reduced-motion handling.
Add an unread notification bell to the control-panel quick-add bar and dashboard header.
Keep notification history until marked read; never hard-delete it.
Add a Settings control for optional botifications:
Request permission only after an explicit user click.
Send browser notifications only when the document is hidden and permission is granted.
Clicking focuses the open Key of Solomon tab and follows the entity deep link.
Do not duplicate the browser notification when the relevant chat/detail view is already visible.
Browser notifications are supported while a Key of Solomon tab is open; background push while the application is fully closed is outside this iteration.
Approval and SSE interfaces
Add resolutionNote?: string to approval responses.
Accept { note?: string } on approve/reject endpoints.
Add enriched target information without removing existing approval fields.
Register approval_requested, approval_resolved, and notification_created in the frontend SSE client.
Keep webhook payloads ID-only; UI notification content never enters the OpenClaw webhook outbox.
Update canonical API, dashboard, data-model, OpenClaw deployment, environment, and progress documentation. Clarify that the dashboard remains mutation-free but now navigates into editable control-panel details.
Test and Rollout Plan
Automated verification
Test idempotent migrations for chat messages, notifications, and approval resolution notes.
Use a fake streaming OpenClaw server to verify:Fixed Gordon agent and stable session routing.
Streaming chunk parsing and persistence.
Full-token-only access.
Gordon token rejection on integration chat routes.
Input limits, timeout, concurrency, retry, restart recovery, and secret redaction.

Test notification generation, deduplication, read/read-all behavior, and correct task links.
Test approval enrichment, resolution notes, double-resolution protection, and immediate Gordon wakeup.
Add frontend tests for deep-linked detail opening, keyboard navigation, approval actions, streaming chat rendering, toast actions, notification history, and mocked browser permission behavior.
Run backend tests, TypeScript checks, frontend tests, production frontend build, and git diff --check.
Confirm unrelated brag-output/ content remains untouched.
Visual and supervised acceptance
Verify the dashboard at 2048×1152 and 1440×900 against the supplied screenshots.
Confirm increased text remains readable without clipping or changing the six-column command-board structure.
Verify mouse, keyboard, Back button, hard-refresh, and bookmark navigation for each entity type.
Complete one supervised task through Gordon and confirm:Task leaves Due Today/In Progress.
Task appears in Done Today.
One actionable in-app completion pop-up appears.
One notification-history entry is created.
Optional browser notification appears only when the tab is hidden.
“View task” opens the correct completed task.

Send one supervised chat turn, confirm streamed Gordon output, transcript persistence after refresh, and one safe Gordon action using the scoped API.
Request, approve, and reject test approvals; confirm target previews, decision notes, realtime removal, notification behavior, and Gordon’s immediate continuation wake.
Deployment dPreserve all current uncommitted Gordon/OpenClaw migration work.
Keep the webhook and chat credentials separate.
Keep both OpenClaw surfaces private to Tailscale.
The webhook remains the event/wakeup plane; direct Gateway chat is used only for user-initiated conversations.
SQLite remains the authoritative task store; the new chat table stores conversation history only.
Start with browser notifications disabled until the user explicitly grants permission.
