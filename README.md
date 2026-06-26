# Key of Solomon · Beta 1

Local-first task / project / idea command center with a live animated neon dashboard and an agent-safe API.

```bash
cp .env.example .env
npm install
npm run seed
npm start
```

- Control Panel → http://localhost:8787/app
- Live Dashboard → http://localhost:8787/dashboard
- API → http://localhost:8787/api/v1

Full documentation lives in [`/docs`](./docs/README.md):
[Setup](./docs/LOCAL_SETUP.md) · [Data model](./docs/DATA_MODEL.md) · [API](./docs/API.md) · [Agent API](./docs/AGENT_API.md) · [Statuses](./docs/STATUS_RULES.md) · [Dashboard](./docs/DASHBOARD.md) · [Webhooks](./docs/WEBHOOKS.md) · [Examples](./docs/EXAMPLES.md)

## Project structure

```
neondeck/
  server/src/
    server.ts          # Express app, static UI, SSE, route mounting
    db.ts              # SQLite schema + settings
    helpers.ts         # envelope, auth, validation, serialization
    store.ts           # shared data-access (notes, attachments, logging, archive)
    events.ts          # SSE broadcast hub
    seed.ts            # demo data loader
    routes/
      projects.ts  tasks.ts  ideas.ts      # standard CRUD + notes/attachments
      misc.ts       # notes, attachments, settings, export/import, webhooks, action log
      dashboard.ts  # GET /dashboard/state builder
      agent.ts      # agent-safe API (validated, logged, no deletes)
  public/
    app/index.html        # Control Panel (zero-build vanilla JS SPA)
    dashboard/index.html  # Live animated dashboard
  docs/                   # full markdown documentation
  data/                   # SQLite database (created at runtime, gitignored)
```
