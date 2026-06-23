# TASK-014 — Universal Time Tracking (All Tasks, Not Just Billable)

## Context

Time tracking currently gates on `project.billable`. Three enforcement points:

1. **Server** — `POST /api/tasks/:id/sessions/start` returns 400 if project is not billable (`server/src/routes/tasks.js` line ~429)
2. **Client drag handler** — `BoardPage.tsx` wraps session calls in `if (task.project_billable)` (`handleDragEnd` and `handleBlockedConfirm`)
3. **Client heartbeat** — `BoardPage.tsx` heartbeat `useEffect` only sends for `project_billable` tasks
4. **Task drawer** — `TaskDrawer.tsx` line ~820 wraps the entire time section in `{isBillable && (` — time section hidden for non-billable tasks

Jordan wants all tasks to track time regardless of whether the project is billable.

## Objective

Remove the billable gate from all three enforcement points so that every task tracks time when moved to In Progress, and the time section is always visible in the drawer.

## Acceptance Criteria

- [x] `POST /api/tasks/:id/sessions/start` accepts any task regardless of `project.billable`
- [x] Moving any task TO In Progress (drag or status change) starts a time session
- [x] Moving any task FROM In Progress closes the time session
- [x] Heartbeat sends for ALL in_progress tasks (not filtered by `project_billable`)
- [x] TaskDrawer shows the time section (auto-tracked + manual adjustment) for all tasks
- [x] Existing billable task time tracking still works as before

## Implementation Notes

### 1. Server — `server/src/routes/tasks.js`

Remove the billable guard in `POST /:id/sessions/start` (lines ~420–431):

```js
// Remove this block entirely:
if (!task.project_billable) {
  return res.status(400).json({ error: 'Project is not billable; time tracking is disabled' });
}
```

The query that fetches the task for validation can also drop `p.billable AS project_billable` from its SELECT since it's no longer used. (The list query at line ~50 should keep it — it's used by the client for display.)

### 2. Client — `client/src/pages/BoardPage.tsx`

**`handleDragEnd`** — remove the `if (task.project_billable)` wrapper around session calls. Both branches (start + end) should fire unconditionally:

```tsx
// Before
if (task.project_billable) {
  if (newStatus === 'in_progress') { ... start ... }
  else if (task.status === 'in_progress') { ... end ... }
}

// After
if (newStatus === 'in_progress') { ... start ... }
else if (task.status === 'in_progress') { ... end ... }
```

**`handleBlockedConfirm`** — same pattern, remove `task.project_billable &&` guard:

```tsx
// Before
if (task.project_billable && task.status === 'in_progress') { ... end ... }

// After
if (task.status === 'in_progress') { ... end ... }
```

**Heartbeat `useEffect`** — remove `&& Boolean(t.project_billable)` from the filter:

```tsx
// Before
tasks.filter((t) => t.status === 'in_progress' && Boolean(t.project_billable))

// After
tasks.filter((t) => t.status === 'in_progress')
```

### 3. Client — `client/src/components/TaskDrawer.tsx`

Remove the `{isBillable && (` conditional wrapper around the time section (line ~820). The time section should always render. The `isBillable` variable and `selectedProject?.billable` logic can be kept if used elsewhere, or removed if not. Check whether `isBillable` is used anywhere besides the time section guard — if not, delete it.

## Out of Scope for This Task

- Changing the `billable` field on projects (TASK-015)
- Reporting or exporting time data
- UI indication of whether a project is billable on the board card

## Dependencies

none

## Priority

P2

## Completion Summary

Removed the billable gate from all four enforcement points so that every task now tracks time regardless of project billability.

### Files Changed

- `server/src/routes/tasks.js` — removed the `!task.project_billable` 400-guard from `POST /:id/sessions/start`; simplified the validation query to a plain `SELECT id FROM tasks WHERE id = ?` (no JOIN needed).
- `client/src/pages/BoardPage.tsx` — three changes:
  - `handleDragEnd`: removed `if (task.project_billable)` wrapper; session start/end now fires unconditionally on status transitions.
  - `handleBlockedConfirm`: removed `task.project_billable &&` guard so sessions end when any in-progress task is blocked.
  - Heartbeat `useEffect`: removed `&& Boolean(t.project_billable)` filter so all in-progress tasks receive heartbeats.
- `client/src/components/TaskDrawer.tsx` — removed `isBillable` variable (and its `selectedProject` lookup) and replaced `{isBillable && (<div...>` with an unconditional `<div>` so the time section always renders.

### Feedback Loop

`npm run feedback` — 3/3 Playwright screenshot tests passed.

### Deviations

None. Implementation followed the task notes exactly.
