# Webhooks

## Implemented (inbound)

Four endpoints exist so external tools (Zapier, n8n, Shortcuts, scripts) can push items in. **Auth is required** — same bearer token as the rest of the API.

### `POST /api/v1/webhooks/task`

Body: same as task create (`title` required, optional `parentTaskId`) plus optional
`source` string. A system note "Created via webhook from `<source>`" is attached
automatically. `parentTaskId` must identify an existing main task.

```bash
curl -X POST http://localhost:8787/api/v1/webhooks/task \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Call insurance company","priority":"high","source":"ios-shortcut"}'
```

### `POST /api/v1/webhooks/idea`

Body: same as idea create (`title` required). Optional `source`.

### `POST /api/v1/webhooks/note`

Body: `body`, `parentType`, `parentId` required. Created with `createdBy: "system"`.

### `POST /api/v1/webhooks/agent-update` *(Beta 2)*

Generic agent push endpoint. Broadcasts the payload to all SSE clients as an `agent_action` event.

```bash
curl -X POST http://localhost:8787/api/v1/webhooks/agent-update \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"agentName":"Gordon","summary":"Completed daily review","details":"3 tasks updated."}'
```

Required: `summary`. Optional: `agentName`, `actionType`, `targetType`, `targetId`, `details`. Useful for agents that are not calling the full agent API but want their activity to appear on the dashboard.

## Outbound to Gordon / OpenClaw

Key of Solomon publishes eligible user-originated task, project, idea, and
approval changes to OpenClaw's native `/solomon` mapping. It sends only event
IDs, entity IDs/types, priority, and timestamps; Gordon fetches authoritative
content through the scoped API.

Deliveries use a persistent SQLite outbox. Transient failures retry with bounded
backoff, permanent failures remain visible in Agent Center, and queued deliveries
resume after restart. Gordon-originated mutations do not enqueue another wake.

Configuration is environment-only:

```dotenv
OPENCLAW_WEBHOOK_ENABLED=true
OPENCLAW_SOLOMON_WEBHOOK_URL=<complete-secret-tailnet-url>
OPENCLAW_HOOK_TOKEN=<dedicated-hook-token>
```

The hook token is sent as `Authorization: Bearer …`. The complete destination
and token are never returned by the API or stored in git. See
`integrations/openclaw/` for the OpenClaw mapping and deployment runbook.

## Direct Gordon chat is a separate plane

User-initiated Agent Center chat uses OpenClaw's private Chat Completions
Gateway endpoint, not the `/solomon` wake hook. The Key of Solomon server fixes
the target to Gordon (`openclaw/main`), keeps the full Gateway token server-only,
and proxies a normalized streaming response to the browser. This chat path does
not replace the webhook: the webhook remains the asynchronous event/wakeup plane,
and the scoped Key of Solomon API remains the task control/data plane.

The three credential classes must remain distinct:

- `GORDON_API_TOKEN` for `/api/v1/agent/**`
- `OPENCLAW_HOOK_TOKEN` for the native `/solomon` webhook
- `OPENCLAW_GATEWAY_TOKEN` for owner-initiated direct chat

Neither notification text nor user task content is copied into the outbound
webhook outbox. Wake payloads remain ID-only metadata.

## Planned (not implemented)

- **Per-webhook tokens** so the main API token never leaves the box.
- **Inbound email-to-task** gateway.

The `/api/v1/webhooks/*` namespace is reserved; nothing else will be added under it.
