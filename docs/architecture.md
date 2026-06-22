# Architecture — Local Kanban Board

## System Overview
Local single-user Kanban app. React + Vite SPA communicates with a local Express API. SQLite (better-sqlite3) stores all data as a local file. No auth, no external services, no cloud.

## Component Map

```
Browser (React + Vite, :5173)
  └── Express API (Node.js, :3001)
       └── SQLite (better-sqlite3, ./server/data/kanban.db)
```

## Data Model Summary

| Entity | Table | Notes |
|--------|-------|-------|
| Project | projects | id, name, color, billable (bool), completed (bool), created_at |
| Task | tasks | id, project_id FK, name, priority 1–4, notes, status, done_at, manual_adjustment_minutes, created_at, updated_at |
| Subtask | subtasks | id, task_id FK, label, checked — informational only, no automation |
| BlockedReason | blocked_reasons | id, task_id FK, reason, created_at — full history log, never overwritten |
| TimeSession | time_sessions | id, task_id FK, started_at, ended_at, minutes — one row per In Progress period |

## External Integrations
None.

## Key Constraints
- All timestamps stored as ISO 8601 UTC strings in SQLite
- Done column shows only tasks with `done_at` within the last 72h; older done tasks visible on Project Detail only
- Time sessions are auto-managed by the API on status transitions; `manual_adjustment_minutes` on the task is a separate ledger (never overwrites session time)
- Deleting a project cascades to all child tasks, subtasks, blocked_reasons, time_sessions
- Vite dev proxy forwards `/api/*` to `:3001` — no CORS config needed in dev

## Layer Responsibilities

| Layer | What lives here | What does NOT live here |
|-------|----------------|------------------------|
| Frontend (React) | UI state, drag-and-drop, form validation, display formatting | Business logic, time session management |
| API (Express) | CRUD, time session open/close on status change, cascade deletes | UI concerns |
| Database (SQLite) | Schema, data, FK relationships | Business logic |

## Testing Strategy
- Visual / E2E: Playwright — screenshots of Board and Projects pages; run via `npm run feedback` from repo root
- Unit tests: not planned for v1 (single-user local tool)
