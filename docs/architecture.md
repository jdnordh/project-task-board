# Architecture — Grove

## System Overview
Grove is a local, single-user kanban board. A React SPA talks to a local Express API that stores everything in one SQLite file. No auth, no cloud. One column ("Claude") hands a task to a Claude Code session and shows that session's live status; the session reports back through the `grove-agent` MCP server (or the `scripts/grove.js` CLI).

The build follows the Cadence rebuild spec (Board, Features, Achievements, Settings), renamed to Grove and kept on the Tech Forest design system (dark only).

## Component Map

```
Browser (React + Vite, :3005)  ──/api proxy──►  Express API (:3004)  ──►  SQLite (node:sqlite, server/data/grove.db)
                                                    ▲
Claude Code session ── grove-agent MCP (stdio) ─────┤  (REST only, never SQLite)
                    └─ node scripts/grove.js ───────┘
```

| Path | What it is |
|------|------------|
| `server/src/lib/` | Pure, browser-safe rule modules (no I/O). Imported by the server **and** the client. |
| `server/src/store.js` | Every DB read/write; applies the lib rules. |
| `server/src/achievements.js` | Achievement checks over the activity log. |
| `server/src/app.js` | Express routes and gating. |
| `server/src/db.js` | Schema, legacy import, settings seed. |
| `server/mcp/agent-server.js` | `grove-agent` MCP server (stdio). |
| `scripts/grove.js` | CLI fallback for sessions without MCP. |
| `client/src/App.tsx` | Root: all state, every mutation handler, hash routing. |
| `client/src/pages/` | Board, Features, Settings, Achievements. |
| `client/src/components/` | Drawer, templates modal, cards, pickers, shared UI. |
| `client/src/extras/` | Skins (`useSkin`), camo textures, unlock pop-up. |

## Data Model Summary

| Table | Notes |
|-------|-------|
| features | `f-…` ids; name, color (always set), sort_order, completed, skin, claude_model, claude_effort |
| tasks | `t…` ids; title, feature FK (cascade), priority 1–9, est (h), due `YYYY-MM-DD`, status, `desc` (plaintext mirror) + `desc_html`, subtasks JSON, started/completed_at (server-managed), agent_state/note/at/report, Claude overrides |
| task_files | HTML files a Claude session linked; bytes copied into `content` (≤10 MB) |
| task_templates | partial task `fields` JSON; absent key = leave the task's own value |
| settings | key/value strings (theme, route, user_name, default_est, board options, hidden_pages, extras, achievement_hints) |
| activity_log | append-only `task_status` events; the only evidence achievements read |
| achievements | sticky unlocks with a `seen` flag |

IDs are `prefix + Date.now() base36 + counter`, so they encode creation time.

## Key Rules
- Dates: a due date is a local calendar date. "Today" comes from local date parts, never `toISOString()`.
- `updateTask`: `completed_at` set on entering Done, cleared on leaving; `started_at` set once on first entry to In Progress/Claude; entering Claude resets agent fields; a manual agent patch applies after that reset.
- The drawer sends `agent_state`/`agent_note`/`subtasks` only when the user changed them, so a Claude session's writes survive a plain save.
- `agentRules()` (lib/agent.js) is the single copy of the session working rules: MCP instructions, end of `get_task`, `how_to_report`.
- Gated routes (`POST /api/tasks/:id/files`): `Authorization: Bearer $GROVE_TOKEN` + localhost Origin, fail closed. `.env` (git-ignored) is created with a random token on first run.
- Linked HTML is served from the stored copy with `Content-Security-Policy: sandbox …` (no `allow-same-origin`), only to a localhost Host.
- Extras off: no checks, no toasts, skins render as plain colours, Achievements page hidden. Nothing is deleted.

## Legacy import
On first boot with an empty `grove.db`, the old `kanban.db` (projects/tasks/subtasks) is copied to `server/data/kanban-backup-<date>/` and imported from that copy: projects → features, `ready` → This Week, `in_progress` → In Progress, notes → description. Billable/paid flags, time sessions and blocked reasons are dropped. The original files are not touched, and no activity events are created for imported rows.

## Testing Strategy
- Unit + API: `npm test` (node --test) — pure rules, HTTP routes on an in-memory DB, achievements, MCP output.
- Types: `npm run typecheck`.
- Visual: `npm run feedback` (Playwright screenshots; dev server must be running).
