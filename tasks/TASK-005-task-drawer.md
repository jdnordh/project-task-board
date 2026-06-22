# TASK-005 — Task Drawer (Create / Edit)

## Context
TASK-003 (Projects) and TASK-004 (Board) are complete. Tasks can be viewed and moved between columns. This task adds the create/edit drawer that slides in from the right. The prototype in `prototypes/` shows the drawer design — use it as the visual reference.

## Objective
Clicking "+ New Task" or a task card opens a drawer from the right; users can create or edit tasks with all fields, including subtasks; changes are persisted; unsaved changes trigger a confirm-discard modal on dismiss.

## Acceptance Criteria
- [ ] `POST /api/tasks/:id/subtasks` — creates a subtask under a task
- [ ] `PATCH /api/subtasks/:id` — updates label or checked state
- [ ] `DELETE /api/subtasks/:id` — removes a subtask
- [ ] Drawer slides in from the right on: clicking "+ New Task" (top bar) or clicking a task card
- [ ] Drawer dismiss: clicking outside closes it; if unsaved changes exist, shows confirm-discard modal first
- [ ] **Name field**: text input, required
- [ ] **Project picker**: pill buttons showing all non-completed projects (with project color dot); single-select; required
- [ ] **Priority picker**: 4 pill/chip options (1/2/3/4 with color coding per Visual Notes); default 2
- [ ] **Notes**: free-text textarea
- [ ] **Subtasks**: checklist — add item (Enter or + button), remove item (×), toggle checked; all changes saved as part of drawer save
- [ ] **Time spent section** (only shown if parent project is billable — hide entirely for non-billable):
  - Display auto-tracked total from `time_sessions` (e.g., "2h 14m") — not editable directly
  - Manual adjustment: chips (+5 / +15 / +30 / −5 min) + tap-to-edit exact-minutes field
  - Both auto-tracked and manual adjustment totals displayed separately (not silently merged)
- [ ] **Delete task** button at bottom of drawer (or footer); opens confirmation modal; on confirm, deletes task and closes drawer
- [ ] `DELETE /api/tasks/:id` endpoint — cascades subtasks, blocked_reasons, time_sessions
- [ ] On save (create): `POST /api/tasks`, then refresh board
- [ ] On save (edit): `PATCH /api/tasks/:id` + subtask CRUD, then refresh board
- [ ] After creating/editing a task, board re-fetches and re-renders correctly

## Implementation Notes

### Subtask sync strategy
On save, compute diff between original subtasks and current drawer state:
- New items → POST
- Modified items → PATCH
- Removed items → DELETE

Or: replace-all approach — DELETE all subtasks for task, then POST current list. Simpler but less precise. Either is acceptable; document the choice.

### Unsaved changes detection
Track `isDirty` boolean: set to true on any field change after initial load. On outside-click: if `isDirty`, show modal. Reset on save or discard.

### Time spent display (billable tasks only)
Fetch `GET /api/tasks/:id/time` (or include in task GET) to get:
- `sessionMinutes`: sum of `time_sessions.minutes` for this task
- `manualAdjustmentMinutes`: `tasks.manual_adjustment_minutes`

Display as: "Auto-tracked: 2h 14m | Adjusted: +15m"

Manual adjustment PATCH: `PATCH /api/tasks/:id` with `{ manual_adjustment_minutes: newValue }`.

### Priority color coding (match prototype)
```
1 → red/urgent badge
2 → orange/high badge
3 → blue/medium badge
4 → grey/low badge
```
Check prototype for exact colors.

### Prototype reference
`prototypes/` — Drawer panel is the source of truth for layout, field order, subtask UX, priority chips, and project picker design. Match exactly.

See `docs/design-system.md` (once created) and `docs/architecture.md`.

After completing, start dev server and capture screenshots of: empty create drawer, populated edit drawer, confirm-discard modal.

## Out of Scope for This Task
- Time session auto-tracking (TASK-007) — this task only displays the total and handles manual adjustment
- Blocked reason history display (not in prototype drawer; defer if not shown)

## Demo Checkpoint
Yes — show create + edit drawer, subtasks, confirm-discard, and delete working.

## Dependencies
- Requires: TASK-003, TASK-004
- Blocks: TASK-007

## Priority
medium
