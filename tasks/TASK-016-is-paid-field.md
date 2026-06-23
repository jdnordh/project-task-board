# TASK-016 — Is Paid Field on Billable Tasks

## Context

Tasks don't track whether their time has been invoiced/paid. Jordan wants an `is_paid` boolean on tasks, visible only when the project is billable, plus a bulk "Mark as Paid" action on the Project Detail page for billable projects.

## Objective

Add `is_paid` to the tasks schema, expose it through the API, surface it as a toggle in the Task Drawer (billable projects only), and add a bulk paid-marking UI on the Project Detail page.

## Acceptance Criteria

### Database
- [x] `tasks` table has `is_paid INTEGER NOT NULL DEFAULT 0` column (runtime migration via `ALTER TABLE IF NOT EXIST` guard or `db.exec` idempotent approach — see Implementation Notes)

### API
- [x] `GET /api/tasks` list response includes `is_paid` per task
- [x] `GET /api/tasks/:id` single-task response includes `is_paid`
- [x] `PATCH /api/tasks/:id` accepts optional `{ is_paid: boolean }` and persists it

### Task Drawer
- [x] "Is Paid" toggle visible in the drawer only when the selected project is billable
- [x] Toggle reads current `is_paid` value on drawer open
- [x] Toggling immediately calls `PATCH /api/tasks/:id` with `{ is_paid: boolean }` (no need to wait for Save — treat as instant like status changes)
- [x] Visual: toggle matches the Grove design system; use same switch pattern as TASK-015's billable toggle

### Project Detail Page
- [x] When the project is billable, task rows show a checkbox or toggle for `is_paid` on the right side of each row
- [x] "Mark all as paid" button appears above the task list when the project is billable and at least one task is unpaid
- [x] Clicking "Mark all as paid" calls `PATCH /api/tasks/:id` for each unpaid task — fire in parallel, refresh list on completion
- [x] Paid tasks are visually distinguished (e.g. subtle green tint or a paid badge) so the list is scannable

## Implementation Notes

### DB migration — `server/src/db.js`

`CREATE TABLE IF NOT EXISTS` already ran on existing installs, so ALTER TABLE is needed for existing DBs:

```js
// After the CREATE TABLE block, before the stale-session close:
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists — ignore
}
```

This is idempotent: throws on re-run (caught and swallowed), clean on fresh install via the DEFAULT in CREATE TABLE.

### API — `server/src/routes/tasks.js`

Add `is_paid` to every SELECT that returns task rows (list query line ~50, single task line ~162, project-filtered queries). Add to the PATCH handler's update logic alongside existing fields.

### Task Drawer — `client/src/components/TaskDrawer.tsx`

The drawer already has `isBillable` derived from `selectedProject?.billable` (line ~316). Use it to conditionally render the toggle:

```tsx
{isBillable && (
  <div style={{ /* toggle row */ }}>
    <div style={labelStyle}>Paid</div>
    <button role="switch" aria-checked={isPaid} onClick={handleTogglePaid} ... />
  </div>
)}
```

`isPaid` state initialised from `task.is_paid` on drawer open. `handleTogglePaid` calls `PATCH /api/tasks/:id` immediately (fire-and-forget), updates local state optimistically.

After TASK-014 lands, `isBillable` may no longer exist in the drawer. If so, derive it fresh: `const isBillable = selectedProject?.billable ?? false`.

### Project Detail Page — `client/src/pages/ProjectDetailPage.tsx`

Fetch `project.billable` (already in the Project response). If billable:
- Add `is_paid: boolean` to the local `Task` type
- Render a paid checkbox on each `TaskRow` (right side, before the chevron)
- Add a header-level "Mark all as paid" button that fires parallel PATCHes then re-fetches

The bulk action:
```tsx
async function markAllPaid() {
  const unpaid = tasks.filter(t => !t.is_paid)
  await Promise.all(unpaid.map(t => fetch(`/api/tasks/${t.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_paid: true }),
  })))
  loadTasks()
}
```

Visual for paid tasks: add a small green "Paid" badge (similar to status pill styling) or a checkmark icon. Keep it subtle — don't dominate the row.

## Out of Scope for This Task

- Filtering task list by paid/unpaid status
- Per-session paid tracking
- Reporting / invoicing export

## Dependencies

none (conceptually pairs with TASK-014 and TASK-015 but no hard dependency)

## Priority

P2

## Completion Summary

### What was built

**Files modified:**
- `server/src/db.js` — added idempotent `ALTER TABLE tasks ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0` migration block (try/catch swallows re-run error)
- `server/src/routes/tasks.js` — added `t.is_paid` to the GET list SELECT; added `is_paid` to the PATCH handler (stored as `1`/`0` integer)
- `client/src/components/TaskDrawer.tsx` — added `isPaid` state; derive `isBillable` from `selectedProject?.billable ?? false`; `handleTogglePaid` fires PATCH immediately (optimistic update with revert on failure); "Is Paid" switch toggle rendered only when `isBillable && isEditMode`
- `client/src/pages/ProjectDetailPage.tsx` — added `is_paid` field to `Task` interface; `handleTogglePaid` (per-row optimistic update); `markAllPaid` (parallel PATCH + reload); `paidBusy` state; `TaskRow` receives `billable` and `onTogglePaid` props; paid rows show green tint background + PAID badge; paid checkbox on right side; "Mark all as paid" button above task list when billable and at least one unpaid task exists

### Deviations from Implementation Notes

- The drawer toggle is gated on `isEditMode` in addition to `isBillable` — create mode has no task id to PATCH, so showing the toggle there would be dead UI. Task note said "billable only"; restricting to edit mode is a minimal safety guard.
- `GET /api/tasks/:id` already returns all columns via `t.*` so no explicit `t.is_paid` alias was needed in the single-task query.

### Feedback loops run

`npm run feedback` — 3/3 Playwright tests passed.

### New ADRs

None.

### Follow-up tasks discovered

None.
