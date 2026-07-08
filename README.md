# Key of Solomon · Beta 2

Local-first task / project / idea command center with a live animated neon dashboard and an agent-safe API.

## Quick start

```bash
cp .env.example .env          # set LOCAL_API_TOKEN
npm install
npm start
```

**`npm start` is enough for normal use.** A pre-built React UI ships in `frontend/dist/`, so you do not need a separate build step just to run the app.

Optional:

- `npm run seed` — load demo data (only if the database is empty)
- `npm run build:frontend` — recompile the UI after editing `frontend/src/`, or if startup reports `Frontend → Legacy HTML`

Then open:

| What | URL |
|---|---|
| Control Panel | http://localhost:8787/app |
| Live Dashboard | http://localhost:8787/dashboard |
| Fast Capture | http://localhost:8787/capture |
| Agent Center | http://localhost:8787/app/agent |
| API base | http://localhost:8787/api/v1 |

Full documentation lives in [`/docs`](./docs/README.md):
[Hermes brief](./docs/HERMES_AGENT_BRIEF.md) · [Setup](./docs/LOCAL_SETUP.md) · [Data model](./docs/DATA_MODEL.md) · [API](./docs/API.md) · [Agent API](./docs/AGENT_API.md) · [Statuses](./docs/STATUS_RULES.md) · [Dashboard](./docs/DASHBOARD.md) · [Webhooks](./docs/WEBHOOKS.md) · [Examples](./docs/EXAMPLES.md)

## Project structure

```
neondeck/
  server/src/           # Express API, SQLite, agent routes, SSE
  frontend/src/         # React control panel + live dashboard (source)
  frontend/dist/        # Built SPA (served by Express; committed to repo)
  public/               # Legacy vanilla HTML fallback if dist is missing
  docs/                 # Full markdown documentation
  data/                 # SQLite database (created at runtime, gitignored)
```
