# Webhooks

## Implemented (inbound)

Four endpoints exist so external tools (Zapier, n8n, Shortcuts, scripts) can push items in. **Auth is required** — same bearer token as the rest of the API.

### `POST /api/v1/webhooks/task`

Body: same as task create (`title` required) plus optional `source` string. A system note "Created via webhook from `<source>`" is attached automatically.

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
  -d '{"agentName":"OpenClaw","summary":"Completed daily review","details":"3 tasks updated."}'
```

Required: `summary`. Optional: `agentName`, `actionType`, `targetType`, `targetId`, `details`. Useful for agents that are not calling the full agent API but want their activity to appear on the dashboard.

## Planned (not implemented)

- **Outbound webhooks** — NEONDECK POSTs to your URL on events, signed with HMAC-SHA256.
- **Per-webhook tokens** so the main API token never leaves the box.
- **Inbound email-to-task** gateway.

The `/api/v1/webhooks/*` namespace is reserved; nothing else will be added under it.
