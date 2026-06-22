# TASK-006 — Blocked Reason Modal

## Context
TASK-004 (Board + drag-and-drop) is complete. Tasks can be dragged between columns but moving to Blocked currently updates status without capturing a reason. This task intercepts that transition and requires a reason.

## Objective
Dragging a task into the Blocked column (or changing status to blocked via any UI) opens a modal requiring a reason; on confirm the reason is saved to `blocked_reasons` history and the task moves to Blocked.

## Acceptance Criteria
- [x] `POST /api/tasks/:id/blocked-reasons` — creates a blocked_reason row; body: `{ reason: string }`; returns the new row
- [x] `GET /api/tasks/:id/blocked-reasons` — returns all blocked reason rows for a task, ordered by created_at DESC
- [x] Dragging a task to the Blocked column: drop is intercepted — task does NOT move yet; Blocked Reason modal opens
- [x] Modal: single required text field ("Why is this blocked?"); Confirm button disabled while field is empty
- [x] On confirm: POST to blocked-reasons, then PATCH task status to 'blocked'; task card appears in Blocked column
- [x] On cancel: modal closes; task returns to its original column (drag is fully reverted)
- [x] Blocking a task that was previously blocked creates a NEW blocked_reason row (does not overwrite)
- [x] Task card in Blocked column shows the most recent blocked reason as a subtitle/badge (fetch from blocked_reasons or include in task GET)

## Implementation Notes

### Intercept drag-drop
In the dnd-kit `onDragEnd` handler (from TASK-004), before calling PATCH:
```js
if (newStatus === 'blocked') {
  setPendingBlockedTask({ taskId, fromColumn });
  setBlockedModalOpen(true);
  return; // don't update status yet
}
```
Store `pendingBlockedTask` in state. On modal confirm: fire POST blocked-reason + PATCH status. On modal cancel: clear `pendingBlockedTask`, no status change.

### Include most recent blocked reason in board data
Option A: Add a `latest_blocked_reason` join to `GET /api/tasks`:
```sql
LEFT JOIN blocked_reasons br ON br.task_id = tasks.id
  AND br.id = (SELECT id FROM blocked_reasons WHERE task_id = tasks.id ORDER BY created_at DESC LIMIT 1)
```
Option B: Fetch blocked reasons lazily when rendering a card in the Blocked column.

Option A preferred — one fewer round trip.

### Prototype reference
`prototypes/` — check if the Blocked modal is shown in the prototype; if so, match its design exactly.

See `docs/architecture.md`.

After completing, capture screenshot of: task being dragged to Blocked column with modal open; Blocked column with reason visible on card.

## Out of Scope for This Task
- Viewing full blocked reason history (could be a future enhancement in the drawer)
- Any status change UI other than drag-and-drop (if the drawer has a status picker, it should also trigger this modal — defer to TASK-005 fix-up if needed)

## Demo Checkpoint
Yes — show blocked modal, reason required, reason saved, card shows reason.

## Dependencies
- Requires: TASK-004
- Blocks: none

## Priority
medium

## Completion Summary

### What Was Built

**Server (`server/src/routes/tasks.js`):**
- `POST /api/tasks/:id/blocked-reasons` — validates `reason` (non-empty string), verifies task exists (404 if not), inserts a new `blocked_reasons` row, returns the row. Never overwrites existing rows — history is append-only.
- `GET /api/tasks/:id/blocked-reasons` — returns all rows for a task ordered by `created_at DESC`. 404 if task doesn't exist.
- Modified `GET /api/tasks` to include `latest_blocked_reason` via a `LEFT JOIN blocked_reasons` with a correlated subquery (`SELECT id ... ORDER BY created_at DESC LIMIT 1`). This avoids duplicate task rows when a task has multiple blocked reasons.

**Client (`client/src/components/BlockedReasonModal.tsx`)** — new component:
- Matches Grove Board prototype design exactly (lines 434–455 of `prototypes/Grove Board.dc.html`).
- Warning icon badge, "Why is this blocked?" title, task name subtitle, helper text, resizable textarea with "Waiting on…" placeholder.
- "Move to blocked" button is disabled and styled faint when textarea is empty; activates with `var(--danger-soft)` / `var(--clay-400)` colors.
- ESC key triggers cancel. Textarea auto-focuses on mount.
- Uses `var(--danger-soft)`, `var(--danger)`, `var(--clay-400)` design tokens matching prototype.

**Client (`client/src/pages/BoardPage.tsx`)** — modified:
- Added `latest_blocked_reason: string | null` to the `Task` interface.
- Added `postBlockedReason()` API helper.
- Added `pendingBlockedTask` and `blockedModalOpen` state.
- `handleDragEnd` intercepts drops to `blocked` column before any optimistic update — stores the task in `pendingBlockedTask` and opens the modal; returns early.
- `handleBlockedConfirm(reason)` — sequentially: POST blocked-reason → PATCH status → update local task state (status + latest_blocked_reason). If POST fails, PATCH is skipped — task stays in original column.
- `handleBlockedCancel` — clears pending state; no revert needed (no optimistic update was applied).
- `TaskCard` updated to accept `inBlockedColumn` prop; renders a danger-badge below the task name showing `latest_blocked_reason` (matches prototype lines 148–153).
- `DraggableTaskCard` passes `inBlockedColumn` down; `BoardColumn` sets it to `true` when `col.key === 'blocked'`.
- `BlockedReasonModal` rendered conditionally in the return tree.

### Feedback Loop
The `npm run dev` and `npm run feedback` commands required permissions that were unavailable in this session. The server (port 3001) was confirmed running (`curl -s http://localhost:3001/api/health` returned `{"ok":true}`). The Vite dev server (port 5173) was not available for screenshot capture.

### Screenshots
Screenshots could not be captured — the Vite dev server was not running and could not be started within session permissions. Screenshots should be captured manually:
1. Drag any task to the Blocked column; the modal should open.
2. Enter a reason and confirm; card should appear in Blocked with reason badge.

### Deviations from Implementation Notes
None. Option A (LEFT JOIN subquery) was used for `latest_blocked_reason` as preferred. The `pendingBlockedTask` stores the full `Task` object (not just `taskId` + `fromColumn`) since the task name is needed for the modal subtitle and the full object enables the local state update on confirm.

### New ADRs
None required.

### Follow-up Tasks
None discovered. If the Task Drawer (TASK-005) adds a status picker, it should also trigger this modal — noted in TASK-006 Out of Scope.
