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
