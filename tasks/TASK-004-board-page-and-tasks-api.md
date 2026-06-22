# TASK-004 — Board Page + Tasks API

## Context
TASK-002 has scaffolded the backend and client. The `tasks` table exists. The prototype in `prototypes/` shows the exact Board page UI — 5 columns, drag-and-drop, filter pills, collapsible Backlog. This task wires the Board to real data. `subtasks`, `blocked_reasons`, and `time_sessions` are NOT handled here (later tasks).

## Objective
The Board page is fully functional with real data: tasks can be viewed across 5 columns, dragged between columns (status updates persisted), filtered by project, and auto-sorted by priority within each column.

## Acceptance Criteria
- [ ] `GET /api/tasks` — returns all tasks with their `project` joined (id, name, color), filtered by optional `?projectIds=1,2,3` query param
- [ ] `POST /api/tasks` — creates a task; validates name (required), project_id (required, must exist), priority (1–4, default 2), status (default 'backlog')
- [ ] `PATCH /api/tasks/:id` — updates any task field(s); sets `done_at = datetime('now')` when status changes to 'done', clears it when status leaves 'done'; sets `updated_at` on every update
- [ ] Board page (`/`) renders 5 columns: Backlog, Ready, In Progress, Blocked, Done
- [ ] Done column only shows tasks where `done_at` is within the last 72 hours
- [ ] Within each column, tasks auto-sort by priority ascending (1 first)
- [ ] Drag-and-drop between any two columns (dnd-kit); on drop, calls PATCH to update status; optimistic UI update
- [ ] Backlog column is collapsible; collapsed/expanded state persisted in a cookie; expanded by default on first visit
- [ ] Filter pills above the board: one pill per non-completed project, multi-select, OR logic (no selection = show all); active filters highlight the pill
- [ ] Left nav bar renders with "Board" and "Projects" links (icons + labels); active route highlighted
- [ ] Top bar with "+ New Task" button (button renders but opens nothing yet — wired in TASK-005)
- [ ] Board scrolls horizontally on narrow viewports (columns keep min-width, no squishing)

## Implementation Notes

### API — server/src/routes/tasks.js
Register under `/api/tasks`.

PATCH status transition — `done_at` logic:
```js
if (body.status === 'done' && existing.status !== 'done') {
  updates.done_at = new Date().toISOString();
} else if (body.status && body.status !== 'done') {
  updates.done_at = null;
}
updates.updated_at = new Date().toISOString();
```

72h filter for Done column (frontend):
```js
const cutoff = Date.now() - 72 * 60 * 60 * 1000;
doneTasks = tasks.filter(t => t.status === 'done' && new Date(t.done_at) > cutoff);
```

### dnd-kit setup
```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```
- `<DndContext>` wraps the board
- Each column is a `<Droppable>` (use `useDroppable`)
- Each task card is a `<Draggable>` (use `useDraggable`)
- On `onDragEnd`: call PATCH with new status; update local state optimistically

### Backlog cookie
Use `document.cookie` or a small cookie library. Key: `backlog_expanded`, value: `'true'` / `'false'`.

### Filter pills
Fetch projects from `GET /api/projects` on mount. Render one pill per non-completed project. Multi-select state in React. Pass selected project IDs to `GET /api/tasks?projectIds=...`.

### Prototype reference
`prototypes/` is the visual source of truth for: column layout, task card design (priority badge/dot, project color indicator), filter pill style, nav bar, top bar. Match it exactly — do not redesign.

See `docs/architecture.md`, `docs/decisions.md` (ADR-003 for dnd-kit).

After completing this task, start the dev server and capture screenshots for the batch report.

## Out of Scope for This Task
- Blocked reason modal (TASK-006)
- Time session management (TASK-007)
- Task Drawer / edit (TASK-005)
- "+ New Task" opening the drawer (TASK-005)

## Demo Checkpoint
Yes — show Board with drag-and-drop, filter pills, and priority sorting working end-to-end.

## Dependencies
- Requires: TASK-002
- Blocks: TASK-005, TASK-006, TASK-007

## Priority
high
