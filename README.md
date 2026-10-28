# Grove

A local, single-user kanban board with a **Claude** column: drop a card there, paste the copied prompt into a new Claude Code chat, and the card shows that session's status, ticked subtasks, report and linked HTML files as it works.

## Run it

```bash
npm install && npm --prefix server install && npm --prefix client install
npm run dev
```

Open http://localhost:3005. The API runs on :3004 and stores everything in `server/data/grove.db`. On first run it creates `.env` with a random `GROVE_TOKEN` (git-ignored) and imports the old `kanban.db` board if there is one.

## Let Claude Code report to the board

Register the MCP server once, at user scope, so it works from any folder:

```bash
claude mcp add --scope user grove-agent -- node <repo>/server/mcp/agent-server.js
```

Sessions without the tools can use the CLI: `node scripts/grove.js task <id>` (also `task-status`, `task-subtask`, `task-report`, `task-file`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch) + Vite |
| `npm test` | Server unit and API tests (`node --test`) |
| `npm run typecheck` | Client TypeScript check |
| `npm run feedback` | Playwright screenshots (needs `npm run dev`) |

See `docs/architecture.md` and `docs/decisions.md` for the design.
