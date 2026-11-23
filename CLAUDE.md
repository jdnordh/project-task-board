# project-task-board

Grove — local single-user kanban board with a Claude column. Node + Express + `node:sqlite` API on :3004 (`/server`, ESM), React + Vite on :3005 (`/client`). No auth, no cloud. Built from the Cadence rebuild spec, renamed Grove, Tech Forest design system, dark only.

- Pure rule modules live in `server/src/lib/` (no I/O) and are shared with the client via `client/src/lib.ts`. Put new rules there and test them with `npm test`.
- Claude sessions report via the `grove-agent` MCP server (`server/mcp/agent-server.js`) or `scripts/grove.js`; both use the REST API, never SQLite.
- **Every feature must be reachable through the MCP.** Any change that adds or changes something a user can see or do in Grove (a page, an entity, a field, an action) ships MCP tools for it in the same change: reads and writes, in `server/mcp/board-tools.js` or a sibling module registered by both `agent-server.js` and `buddy-server.js`. Back each tool with a REST route (never SQLite), put its input rules in `server/src/lib/`, and add a test that drives the tool (see `server/test/board-tools.test.js`) plus its name in `server/test/mcp-servers.test.js`. A PR without the MCP side is not done.
- "Projects" were called "features" before 2026-11. `db.js` renames old databases on open (`renameFeaturesToProjects`); use "project" for new code, UI text and MCP tools.
- Buddy (`.claude/skills/buddy/`, the foreman skill) uses the `grove-buddy` MCP server (`server/mcp/buddy-server.js`, registered in `.mcp.json`) to plan, create and delegate tasks to worker sessions in each project's git repo.
- `npm run dev` · `npm test` · `npm run typecheck` · `npm run feedback`

## Key Docs
- `docs/spec.md` — the rebuild spec Grove follows (with Grove renames noted at the top)
- `docs/project-plan.md` — original plan (superseded, history only)
- `docs/architecture.md` — system overview, data model, component map
- `docs/decisions.md` — ADR log (stack choices, drag-and-drop library, etc.)
- `docs/planning.md` — task status board (PM agent owns this)
- `tasks/` — one file per task; never moved or renamed
- `prototypes/` — high-fidelity UI prototype (React + Vite, static demo data); use as visual reference for all UI tasks

## Feedback Loops
- Playwright visual screenshots: `npm run feedback` — see `docs/feedback-loop-playwright.md` (created by TASK-001)
