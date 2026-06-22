# TASK-003 — Projects API + Projects Page

## Context
TASK-002 has scaffolded the Express + SQLite backend and the React + Vite client. The `projects` table exists. The prototype in `prototypes/` shows the exact Projects page UI to replicate — use it as the visual reference. This task wires the Projects page to real data.

## Objective
The Projects page is fully functional: users can create, view, mark complete, and delete projects, all persisted to SQLite.

## Acceptance Criteria
- [ ] `GET /api/projects` — returns all projects (active and completed), ordered by created_at DESC
- [ ] `POST /api/projects` — creates a project; validates name (required), color (one of 12 presets), billable (bool)
- [ ] `PATCH /api/projects/:id` — updates name, color, billable, completed
- [ ] `DELETE /api/projects/:id` — cascades to all child tasks/subtasks/blocked_reasons/time_sessions; returns count of deleted tasks in response body
- [ ] Projects page (`/projects`) renders list of projects matching prototype layout
- [ ] Active projects and completed projects render in separate sections ("Active" / "Completed")
- [ ] Create project: form/modal with name field, 12-color picker, billable toggle — on submit, calls POST and refreshes list
- [ ] Mark project complete: toggle button per project — calls PATCH, moves project between sections
- [ ] Delete project: button opens confirmation modal explicitly stating "This will also delete N tasks" (N from DELETE response or pre-fetched task count)
- [ ] 12 preset project colors implemented as a consistent palette (see Visual Notes below)
- [ ] React Router installed; `/projects` route renders the Projects page; `/` remains a placeholder

## Implementation Notes

### API — server/src/routes/projects.js
Register under `/api/projects` in `server/src/index.js`.

### 12 preset colors
Use a balanced palette at consistent saturation/lightness. Suggested tokens (adjust to match prototype exactly):
```js
const PROJECT_COLORS = [
  '#3B82F6', // blue
  '#06B6D4', // cyan
  '#10B981', // emerald
  '#84CC16', // lime
  '#EAB308', // yellow
  '#F97316', // orange
  '#EF4444', // red
  '#EC4899', // pink
  '#A855F7', // purple
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#F59E0B', // amber
];
```
**Check the prototype first** — if the prototype defines specific colors, use those exactly.

### Cascade delete count
Before deleting, query `SELECT COUNT(*) FROM tasks WHERE project_id = ?` and include the count in the confirmation modal. Or return it from the DELETE endpoint.

### React Router
`npm install react-router-dom`. Add `<BrowserRouter>` in main.tsx. Routes: `/` → Board placeholder, `/projects` → Projects page.

### Prototype reference
`prototypes/` — Projects page is the source of truth for layout, card design, color picker UI, and section separation. Match it closely.

See `docs/architecture.md`, `docs/decisions.md`.

## Out of Scope for This Task
- Project Detail sub-page (TASK-008)
- Navigating to Project Detail from this page (add the link but it can 404 until TASK-008)
- Task creation from Projects page

## Demo Checkpoint
Yes — show Projects page with create, complete, delete working end-to-end.

## Dependencies
- Requires: TASK-002
- Blocks: TASK-008

## Priority
high
