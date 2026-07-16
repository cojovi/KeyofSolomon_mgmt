# Gordon / OpenClaw deployment pack

Key of Solomon remains the only task database. Gordon receives compact wake events through OpenClaw's `/solomon` mapping, then reads and changes authoritative state through the scoped Key of Solomon agent API.

## 1. Key of Solomon host

Set separate random values in `.env`:

```dotenv
GORDON_API_TOKEN=<long-random-agent-token>
OPENCLAW_WEBHOOK_ENABLED=true
OPENCLAW_SOLOMON_WEBHOOK_URL=<complete-tailnet-solomon-hook-url>
OPENCLAW_HOOK_TOKEN=<dedicated-openclaw-hook-token>
OPENCLAW_GATEWAY_CHAT_ENABLED=true
OPENCLAW_GATEWAY_BASE_URL=https://cojovis-mac-mini-1.tail8e0a20.ts.net
OPENCLAW_GATEWAY_TOKEN=<gateway-owner-token>
```

Start the app, then expose it only to the tailnet over HTTPS:

```bash
npm start
tailscale serve --bg 8787
tailscale serve status
```

The Gordon API base is the HTTPS Tailscale Serve URL followed by `/api/v1`. Verify from the Mac Mini:

```bash
curl -s "$SOLOMON_API_BASE/health"
curl -s "$SOLOMON_API_BASE/agent/context/today" \
  -H "Authorization: Bearer $SOLOMON_AGENT_TOKEN" \
  -H "X-Agent-Name: Gordon"
```

## 2. OpenClaw Mac Mini

1. Merge `openclaw.mapping.example.json5` into `~/.openclaw/openclaw.json`, preserving the machine's existing secret hook base path.
2. Set a dedicated hook token matching `OPENCLAW_HOOK_TOKEN`; do not reuse Gateway authentication.
3. Merge `GORDON.md` into Gordon's workspace `AGENTS.md` so OpenClaw loads it as bootstrap policy. Configure `SOLOMON_API_BASE` plus `SOLOMON_AGENT_TOKEN` in Gordon's private runtime environment.
4. For the optional embedded Chat with Gordon panel, enable the Gateway's
   OpenAI-compatible chat surface. The Gateway bearer is full owner/operator
   access, so keep it private to the server and tailnet:

```json5
{
  gateway: {
    http: { endpoints: { chatCompletions: { enabled: true } } }
  }
}
```

5. Validate against the live schema before restart:

```bash
openclaw config schema >/dev/null
openclaw doctor
openclaw gateway restart
openclaw gateway status --require-rpc
```

## 3. Proactive balanced cron

Create persistent isolated reviews in America/Chicago:

```bash
openclaw cron create "0 8 * * *" \
  "Run the Key of Solomon morning review from the Gordon policy in AGENTS.md. Use the scoped API, act on safe executable work, log reminders, and notify the owner only with a useful digest." \
  --name "Solomon morning review" --tz "America/Chicago" --session isolated --agent main --announce

openclaw cron create "30 17 * * *" \
  "Run the Key of Solomon late-day review from the Gordon policy in AGENTS.md. Report unfinished due-today work, stalled in-progress work, blockers, and verified completions." \
  --name "Solomon late-day review" --tz "America/Chicago" --session isolated --agent main --announce
```

Use `openclaw cron list` to capture the generated IDs, then supervise one run of each:

```bash
openclaw cron run <job-id> --wait --wait-timeout 10m
openclaw cron runs --id <job-id> --limit 10
```

## 4. End-to-end proof

1. In Agent Center, send a test event and confirm it becomes `delivered`.
2. Confirm Gordon receives the event in session `hook:solomon` and calls `/agent/context/today`.
3. Create one safe agent-candidate task and observe Gordon fetch it, set `in_progress`, add an evidence note, complete it with `completedByAgent: true`, and log the action.
4. Confirm the dashboard updates and Gordon sends one concise owner-chat completion.
5. In Agent Center, send one harmless Chat with Gordon message and confirm the
   reply streams, persists after refresh, and never exposes the Gateway token.
