# Local Setup

## Requirements

- Node.js 20+ (22 recommended)
- macOS, Linux, or Windows. No external services, no Docker, no cloud.

## Install

```bash
cd neondeck
cp .env.example .env         # edit LOCAL_API_TOKEN to something of your own
npm install
npm start
```

**`npm start` is enough for normal use.** A pre-built React UI ships in `frontend/dist/`.

Optional:

- `npm run seed` — load demo data (only if the database is empty)
- `npm run build:frontend` — recompile the UI after editing `frontend/src/`, or if startup reports `Frontend → Legacy HTML`

`npm start` runs the TypeScript server via `tsx` — no backend build step. On startup you'll see:

```
Control Panel  →  http://localhost:8787/app
Live Dashboard →  http://localhost:8787/dashboard
Fast Capture   →  http://localhost:8787/capture
Agent Center   →  http://localhost:8787/app/agent
API base       →  http://localhost:8787/api/v1
Frontend       →  React (built)
```

## Development mode

Run the backend and frontend separately so you get hot-module-replacement in the browser:

```bash
# Terminal 1 — Express API (auto-restarts on server file changes)
npm run dev

# Terminal 2 — Vite dev server with HMR (port 5173, proxies /api → :8787)
npm run dev:frontend
```

Then open `http://localhost:5173`. Vite proxies all `/api` calls to the Express server.

When you're done iterating, rebuild: `npm run build:frontend`. The server will pick up the new `frontend/dist/` on next restart.

## Environment variables (.env)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | App + API port |
| `LOCAL_API_TOKEN` | `neondeck-local-token-change-me` | Bearer token for all API calls. **Change it.** |
| `GORDON_API_TOKEN` | empty | Separate long random token accepted only under `/api/v1/agent` |
| `OPENCLAW_WEBHOOK_ENABLED` | `false` | Enables persistent outbound Gordon wake events |
| `OPENCLAW_SOLOMON_WEBHOOK_URL` | empty | Complete secret OpenClaw `/solomon` tailnet URL |
| `OPENCLAW_HOOK_TOKEN` | empty | Dedicated OpenClaw hook bearer token |
| `OPENCLAW_GATEWAY_CHAT_ENABLED` | `false` | Enables the private server-side Gordon chat proxy |
| `OPENCLAW_GATEWAY_BASE_URL` | empty | Tailnet-only OpenClaw Gateway base URL, without credentials |
| `OPENCLAW_GATEWAY_TOKEN` | empty | Full owner/operator Gateway bearer token; server-only |
| `DATABASE_PATH` | `./data/neondeck.db` | SQLite file location (auto-created, WAL mode) |

AI provider credentials are stored in the **database settings**, not `.env` — configure them in Settings (`/app/settings`) after starting the server.

## Gordon on another Tailscale device

Keep Key of Solomon running locally and expose port 8787 over tailnet-only HTTPS:

```bash
tailscale serve --bg 8787
tailscale serve status
```

Give Gordon the resulting HTTPS base plus `/api/v1` and only the scoped
`GORDON_API_TOKEN`. Do not give the remote runtime `LOCAL_API_TOKEN`. Complete
OpenClaw configuration and cron instructions live in `integrations/openclaw/`.

For embedded Agent Center chat, separately enable OpenClaw's Chat Completions
endpoint on the Mac Mini and add the three `OPENCLAW_GATEWAY_*` values above to
Key of Solomon's ignored `.env`. The Gateway credential is more privileged than
the scoped Gordon API token and the dedicated hook token; never reuse or expose
it to browser code. Keep the Gateway private to Tailscale.

Browser notifications are disabled by default. Enable them from Settings; the
browser permission prompt is requested only after clicking the explicit enable
control. This iteration supports notifications while a Key of Solomon tab is
open, not background push after the application is fully closed.

## Database

- Schema is created automatically on first start (including all Beta 2 tables).
- `npm run seed` loads demo data only if the DB is empty.
- `npm run seed:force` wipes and reseeds (settings are kept).
- Backup = copy the `data/` folder.

## Running the dashboard fullscreen (kiosk)

```bash
open -a "Google Chrome" --args --kiosk "http://localhost:8787/dashboard"
```

Or open the URL and press `⌃⌘F` / `F11`.

**Dedicated LAN device:** run the server on one machine, point the kiosk at `http://<server-ip>:8787/dashboard`. Note: `/ui-config` (the token hand-off) is **localhost-only** by design. For a LAN kiosk either tunnel (`ssh -L 8787:localhost:8787 user@server`) or edit the localhost check in `server/src/server.ts`.

**Keep it running:** `npx pm2 start "npm start" --name neondeck` or a launchd/systemd unit.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE` | Something else owns 8787 → change `PORT` in `.env` |
| 401 from API | Token mismatch — UI reads it from `/ui-config`, curl needs the `.env` value |
| Dashboard blank / white screen | Run `npm run build:frontend` — the dist may be missing |
| `Frontend → Legacy HTML` on startup | Same as above — dist not built yet |
| Dashboard says SIGNAL LOST | Server stopped or wrong host — it auto-reconnects |
| `disk I/O error` | SQLite WAL fallback handles this; if it persists, set `DATABASE_PATH` to a local disk |
| Fonts look plain | Google Fonts requires internet on first load; cached afterward |
| AI summaries fail | Check Settings → AI Provider — key and model must be set |
| Gordon chat is disabled | Enable the Gateway chat endpoint, set all `OPENCLAW_GATEWAY_*` values, and restart Key of Solomon |
| Browser notification does not appear | Enable it in Settings, allow browser permission, and hide the Key of Solomon tab while testing |
