# TASK-006 — Blocked Reason Modal

## Context
TASK-004 (Board + drag-and-drop) is complete. Tasks can be dragged between columns but moving to Blocked currently updates status without capturing a reason. This task intercepts that transition and requires a reason.

## Objective
Dragging a task into the Blocked column (or changing status to blocked via any UI) opens a modal requiring a reason; on confirm the reason is saved to `blocked_reasons` history and the task moves to Blocked.

## Acceptance Criteria
- [ ] `POST /api/tasks/:id/blocked-reasons` — creates a blocked_reason row; body: `{ reason: string }`; returns the new row
- [ ] `GET /api/tasks/:id/blocked-reasons` — returns all blocked reason rows for a task, ordered by created_at DESC
- [ ] Dragging a task to the Blocked column: drop is intercepted — task does NOT move yet; Blocked Reason modal opens
- [ ] Modal: single required text field ("Why is this blocked?"); Confirm button disabled while field is empty
- [ ] On confirm: POST to blocked-reasons, then PATCH task status to 'blocked'; task card appears in Blocked column
- [ ] On cancel: modal closes; task returns to its original column (drag is fully reverted)
- [ ] Blocking a task that was previously blocked creates a NEW blocked_reason row (does not overwrite)
- [ ] Task card in Blocked column shows the most recent blocked reason as a subtitle/badge (fetch from blocked_reasons or include in task GET)

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
