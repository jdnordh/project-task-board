# TASK-007 — Time Tracking (Auto Sessions + Manual Adjustment)

## Context
TASK-004 (Board + drag-and-drop) and TASK-005 (Task Drawer) are complete. The `time_sessions` table exists. The drawer already shows the time spent section (UI from TASK-005) but auto-tracking isn't wired up yet. This task completes the time tracking loop.

## Objective
Moving a billable task to In Progress auto-starts a time session; leaving In Progress auto-closes it; tab/app close closes any open session; manual adjustment in the drawer is fully functional.

## Acceptance Criteria

### Auto-tracking
- [ ] `POST /api/tasks/:id/sessions/start` — opens a new `time_sessions` row (`started_at = now`, `ended_at = null`); returns the session; only valid if project is billable; errors if a session is already open for this task
- [ ] `POST /api/tasks/:id/sessions/end` — closes the open session (`ended_at = now`, `minutes = ceil((ended_at - started_at) / 60000)`); no-op if no open session
- [ ] Dragging a billable task TO In Progress: calls `sessions/start` after status PATCH
- [ ] Dragging a billable task FROM In Progress (to any column): calls `sessions/end` before or after status PATCH
- [ ] Non-billable tasks: no session calls; time section hidden in drawer

### Tab/app close handling
- [ ] Client sends `POST /api/sessions/heartbeat` every 30 seconds with `{ taskId }` while a task is In Progress
- [ ] `POST /api/sessions/close-stale` — closes any `time_sessions` row where `ended_at IS NULL` and no heartbeat received in the last 60 seconds (server tracks last heartbeat timestamp per open session in memory or in the DB)
- [ ] Server calls `close-stale` logic on startup (closes any sessions left open from a previous run)
- [ ] `beforeunload` event on client: send synchronous `navigator.sendBeacon('/api/sessions/close-stale')` as backup

### Manual adjustment (drawer)
- [ ] +5 / +15 / +30 / −5 chips in drawer call `PATCH /api/tasks/:id` with updated `manual_adjustment_minutes` (delta applied server-side or client sends new absolute value)
- [ ] Tap-to-edit exact minutes field: renders current `manual_adjustment_minutes`, on blur saves via PATCH
- [ ] Drawer displays both totals separately: "Auto-tracked: Xh Ym" + "Manual adjustment: ±Z min"
- [ ] `GET /api/tasks/:id` response includes `sessionMinutes` (SUM of time_sessions.minutes for this task) and `manualAdjustmentMinutes`

## Implementation Notes

### Session start/end in drag handler
In dnd-kit `onDragEnd` (TASK-004):
```js
if (task.project.billable) {
  if (newStatus === 'in_progress') {
    await fetch(`/api/tasks/${taskId}/sessions/start`, { method: 'POST' });
  } else if (oldStatus === 'in_progress') {
    await fetch(`/api/tasks/${taskId}/sessions/end`, { method: 'POST' });
  }
}
```

### Stale session close on startup
In `server/src/db.js` (or index.js after DB init):
```js
db.prepare(`
  UPDATE time_sessions
  SET ended_at = datetime('now'),
      minutes = MAX(1, ROUND((julianday('now') - julianday(started_at)) * 1440))
  WHERE ended_at IS NULL
`).run();
```

### Heartbeat
Client: `setInterval(() => fetch('/api/sessions/heartbeat', { method: 'POST', body: JSON.stringify({ taskId: activeTaskId }) }), 30000)`

Track `activeTaskId` in React context or global state — the task currently In Progress for the current session.

If multiple tasks could be In Progress simultaneously (spec doesn't restrict this), heartbeat sends all active task IDs.

### sessionMinutes in GET /api/tasks
```sql
SELECT t.*, COALESCE(SUM(ts.minutes), 0) as session_minutes
FROM tasks t
LEFT JOIN time_sessions ts ON ts.task_id = t.id
GROUP BY t.id
```

### Prototype reference
Check `prototypes/` for the time tracking UI in the drawer — match the display format exactly.

See `docs/architecture.md`.

## Out of Scope for This Task
- Reporting or exporting time data
- Per-session breakdown view

## Demo Checkpoint
Yes — show: task dragged to In Progress starts session; dragged away closes session; manual adjustment chips work; totals display correctly in drawer.

## Dependencies
- Requires: TASK-004, TASK-005
- Blocks: none

## Priority
medium

---

## Completion Summary

**Implemented:** 2026-06-22

### What was built

**Server — `server/src/routes/tasks.js`**
- Added `p.billable AS project_billable` to the `GET /api/tasks` list query so every task row now carries the project's billable flag
- `POST /api/tasks/:id/sessions/start` — validates task exists (404), project is billable (400), no open session already (400 idempotency guard); inserts row with `started_at = now, ended_at = null, minutes = null`; returns 201 with new row
- `POST /api/tasks/:id/sessions/end` — validates task exists (404); finds open session; if none returns `{ closed: false }` (no-op); otherwise closes with Julian-day minute calc (`MAX(1, CAST(... * 1440 AS INTEGER))`); returns `{ closed: true, session }`

**Server — `server/src/routes/sessions.js`** (new file)
- Module-level `heartbeatMap: Map<taskId, Date>` for in-memory heartbeat tracking (no schema change)
- `POST /api/sessions/heartbeat` — stores `new Date()` for `taskId`; returns `{ ok: true }`
- `POST /api/sessions/close-stale` — queries all open sessions, closes those with no heartbeat entry or heartbeat older than 60 seconds; returns `{ closed: N }`

**Server — `server/src/index.js`**
- Registered `sessionsRouter` at `/api/sessions`

**Client — `client/src/pages/BoardPage.tsx`**
- Added `project_billable: number` to `Task` interface (node:sqlite returns 0/1 integer)
- In `handleDragEnd`: fire-and-forget `sessions/start` when moving TO in_progress, `sessions/end` when moving FROM in_progress (for billable tasks)
- In `handleBlockedConfirm`: fire-and-forget `sessions/end` when task was in_progress and project is billable (blocked intercept bypasses the main drag path)
- New `useEffect` (re-runs when `tasks` changes): 30-second `setInterval` sending heartbeat for all in-progress billable tasks; `beforeunload` listener calling `navigator.sendBeacon('/api/sessions/close-stale')`

### Notes
- Startup stale-session close was already present in `db.js` lines 74-80; not duplicated
- Manual adjustment chips and `session_minutes` in `GET /api/tasks/:id` were already implemented by TASK-005; verified still working

### QA Verdict: PASS

All curl tests passed:
- `POST /api/tasks/1/sessions/start` → 201 with session row (ended_at null)
- Second start → 400 "already open" (idempotency)
- `POST /api/tasks/1/sessions/end` → 200 `{ closed: true, session: { minutes: 1 } }`
- Second end → 200 `{ closed: false }` (no-op)
- `POST /api/sessions/heartbeat` with `{ taskId: 1 }` → `{ ok: true }`
- `POST /api/sessions/close-stale` immediately after heartbeat → `{ closed: 0 }` (fresh heartbeat protected session)
- `GET /api/tasks` → tasks include `project_billable` field
- Start on non-billable project task → 400 "Project is not billable"
- TypeScript check (`npx tsc --noEmit`) → no errors
