# TASK-011 — Task Creation: Status/Column Picker

## Context
When creating a task via the drawer (`TaskDrawer.tsx`), the status always defaults to `backlog` regardless of which column the user might intend. The server's `POST /api/tasks` already accepts a `status` field (`backlog | ready | in_progress | blocked | done`) — the frontend just never sends it. Users should be able to create a task in any column, with `ready` as the default.

Reference files:
- `client/src/components/TaskDrawer.tsx` — drawer component; handles create + edit modes
- `server/src/routes/tasks.js` — `POST /api/tasks` already accepts `status`; default currently `backlog`
- `client/src/pages/BoardPage.tsx` — defines `COLUMNS` array with keys and labels
- `docs/design-system.md` — visual reference

## Objective
Add a status picker to the task creation flow in `TaskDrawer.tsx` so users can choose which column/state the task lands in. Default to `ready`. Hidden in edit mode (status is changed by dragging on the board).

## Acceptance Criteria
- [ ] Status picker visible in **create mode only** (when no `taskId` is provided); hidden when editing an existing task
- [ ] Picker shows all 5 statuses as selectable options: Backlog, Ready, In Progress, Blocked, Done
- [ ] Default selection is `ready` when opening the drawer to create a new task
- [ ] Selected status is sent as `status` in the `POST /api/tasks` body on save
- [ ] Server default for `status` in `POST /api/tasks` changed from `backlog` to `ready` (so API callers that omit the field also get `ready`)
- [ ] Newly created task appears in the correct column on the board after save
- [ ] Picker styling matches existing pill/chip patterns in the drawer (priority picker is the visual reference)

## Implementation Notes
- Status picker placement: between the priority picker and the notes field
- Use the same pill/chip button pattern as the priority picker (4 buttons in a row → 5 for statuses; use a wrapping flex row if needed)
- Label mapping for display: `backlog` → "Backlog", `ready` → "Ready", `in_progress` → "In Progress", `blocked` → "Blocked", `done` → "Done"
- No special color coding required for statuses — use `var(--accent)` highlight for selected, muted for unselected (same as priority chips)
- `TaskDrawer` already receives an optional `initialStatus` prop or can derive default from context — add a `defaultStatus?: string` prop defaulting to `'ready'` if none passed
- In `BoardPage.tsx`, when "+ New Task" is clicked from within a column, pass that column's status as `defaultStatus` to the drawer so the picker pre-selects the right column (nice-to-have, do if straightforward)

## Out of Scope for This Task
- Changing status via the edit drawer (done via drag-and-drop)
- Reordering or hiding columns
- Any changes to the blocked reason flow

## Dependencies
- TASK-005 (Task Drawer) — complete

## Priority
P2
