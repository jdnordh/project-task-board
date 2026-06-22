# TASK-002 — Project Scaffold + DB Schema

## Context
Fresh project. No server or client code exists yet. The prototype in `prototypes/` is the UI reference — a React + Vite app with static demo data, no database, no server. The real app replicates its UI/UX but replaces demo data with a live Express + SQLite backend.

## Objective
`npm run dev` starts both the Express API (`:3001`) and the Vite dev server (`:5173`) with the full SQLite schema initialized, all 5 tables created, and the client proxying `/api/*` to the server.

## Acceptance Criteria
- [ ] `/server` directory: Express app entry point, `package.json`, `better-sqlite3` dependency
- [ ] `/client` directory: Vite + React app (`npm create vite` or equivalent), `package.json`
- [ ] Root `package.json` with `npm run dev` (starts both server and client concurrently), `npm run server`, `npm run client`
- [ ] SQLite DB file initialized at `server/data/kanban.db` on server startup (created if not exists)
- [ ] All 5 tables created with correct schema (see Data Model below)
- [ ] `GET /api/health` returns `{ ok: true }`
- [ ] Vite dev proxy: `/api/*` → `http://localhost:3001`
- [ ] `client/src/App.tsx` renders a placeholder "Board" page and "Projects" placeholder (routing not required yet — static placeholders are fine)
- [ ] `.gitignore` excludes `server/data/kanban.db`, `node_modules` in all three locations

## Implementation Notes

### Directory structure
```
/
├── server/
│   ├── src/
│   │   ├── index.js        ← Express entry point
│   │   ├── db.js           ← DB init + better-sqlite3 singleton
│   │   └── routes/         ← (empty for now, populated in later tasks)
│   ├── data/               ← kanban.db lives here (gitignored)
│   └── package.json
├── client/
│   ├── src/
│   │   └── App.tsx
│   └── package.json (Vite + React + TypeScript)
└── package.json            ← root, dev script uses concurrently
```

### DB Schema (exact column definitions)
```sql
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  billable INTEGER NOT NULL DEFAULT 0,  -- 0/1 boolean
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 2,  -- 1=highest, 4=lowest
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'backlog', -- backlog|ready|in_progress|blocked|done
  done_at TEXT,
  manual_adjustment_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS blocked_reasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  minutes INTEGER
);
```

### concurrently setup
Root package.json dev script:
```json
"dev": "concurrently \"npm run server\" \"npm run client\""
```

### Prototype reference
See `prototypes/` for the target UI. This task does not need to replicate the UI — just get the scaffold up and the health endpoint working. UI comes in TASK-003 and TASK-004.

See `docs/architecture.md` for full architecture decisions. See `docs/decisions.md` for ADR-001 (stack rationale).

## Out of Scope for This Task
- API routes beyond `/api/health`
- React routing
- Any real UI components
- Time session management logic

## Demo Checkpoint
No

## Dependencies
- Requires: none
- Blocks: TASK-003, TASK-004

## Priority
high
