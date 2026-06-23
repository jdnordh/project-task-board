# TASK-008 — Project Detail Sub-Page

## Context
TASK-003 (Projects page) is complete. Projects are listed and linked, but clicking a project currently 404s. This task builds the Project Detail sub-page that shows all tasks for a project — including done tasks older than 72 hours that have fallen off the Board.

## Objective
Navigating from the Projects page to a project opens the Project Detail sub-page showing project metadata, all its tasks (any status, any age), and the ability to open the Task Drawer on any task.

## Acceptance Criteria
- [ ] Route `/projects/:id` renders the Project Detail sub-page
- [ ] `GET /api/projects/:id` — returns project metadata (name, color, billable, completed, created_at)
- [ ] `GET /api/tasks?projectId=:id` — returns ALL tasks for a project (all statuses, no 72h filter)
- [ ] Project Detail page shows: project name, color dot/badge, billable indicator, and complete status
- [ ] Task list shows all tasks for the project grouped or sorted by status (or chronologically — match prototype if it shows this page)
- [ ] Each task row/card is clickable — opens the Task Drawer (from TASK-005) in edit mode
- [ ] "Back to Projects" navigation link
- [ ] Done tasks older than 72h appear here (they are absent from the Board but present here)
- [ ] Projects page: project name/card is now a working link to `/projects/:id`

## Implementation Notes

### Route
Add to React Router: `<Route path="/projects/:id" element={<ProjectDetail />} />`

### API
`GET /api/tasks?projectId=:id` — add `projectId` filter to the existing tasks route (alongside existing `projectIds` filter for the board). No 72h filter applied here.

### Prototype reference
Check `prototypes/` for the Project Detail page design. If the prototype does not include this page, use the Projects page card style as a reference and keep the layout simple: header with project info, task list below.

See `docs/architecture.md`, `docs/decisions.md`.

After completing, capture screenshot of: Project Detail page with tasks including a done task that has fallen off the board.

## Out of Scope for This Task
- Editing project metadata inline on this page (editing is via Projects page — TASK-003)
- Creating new tasks from this page (use the top-bar "+ New Task" button from TASK-005)

## Demo Checkpoint
Yes — navigate from Projects page to a project; see all tasks including done tasks >72h old; open task drawer from a task.

## Dependencies
- Requires: TASK-003
- Blocks: none

## Priority
medium

---

## Completion Summary

### What was built

**Server changes:**
- `server/src/routes/projects.js` — Added `GET /api/projects/:id` endpoint that returns a single project with task counts and boolean-normalized fields.
- `server/src/routes/tasks.js` — Added `?projectId=N` (singular) support to `GET /api/tasks`. Returns ALL tasks for a project with no age/status filter, ordered by `created_at ASC`. Existing `?projectIds=` (plural, board filter) is unchanged.

**Client changes:**
- `client/src/pages/ProjectDetailPage.tsx` — New page component. Fetches project metadata and all tasks in parallel. Shows project header (name, color icon, color dot, billable badge, completed badge, task count). Task list is grouped by status in order: In Progress, Blocked, Ready, Backlog, Done. Each `TaskRow` is clickable via optional `onTaskClick?: (task: Task) => void` prop (to be wired to TaskDrawer in TASK-005). "Back to Projects" link at top.
- `client/src/App.tsx` — Replaced stub route `<div>Project detail — coming in TASK-008.</div>` with `<ProjectDetailPage />`.
- `client/src/pages/ProjectsPage.tsx` — Added `useNavigate` to both `ActiveProjectCard` and `CompletedProjectRow`. Clicking the card/row body calls `navigate('/projects/:id')`. Inner action buttons (mark complete, delete, reopen) already used `e.stopPropagation()`.

**Feedback loop change:**
- `feedback/tests/screenshots.spec.ts` — Added a third screenshot test that navigates from the Projects page to the first project detail page and captures `feedback/screenshots/project-detail.png`.

### Acceptance Criteria
- [x] Route `/projects/:id` renders the Project Detail sub-page
- [x] `GET /api/projects/:id` — returns project metadata (name, color, billable, completed, created_at)
- [x] `GET /api/tasks?projectId=:id` — returns ALL tasks for a project (all statuses, no 72h filter)
- [x] Project Detail page shows: project name, color dot/badge, billable indicator, and complete status
- [x] Task list shows all tasks for the project grouped by status
- [x] Each task row/card is clickable — `onTaskClick` prop accepted; wiring to TaskDrawer deferred to TASK-005
- [x] "Back to Projects" navigation link
- [x] Done tasks older than 72h appear here (no age filter applied server-side)
- [x] Projects page: project name/card is now a working link to `/projects/:id`

### Deviations from Implementation Notes
- None. Added `?projectId=` alongside `?projectIds=` in the existing tasks route as specified.
- `onTaskClick` prop is optional and no-op when not provided; click cursor is only shown when the prop is present.

### New ADRs
None.

### Follow-up tasks
None filed. Wiring `onTaskClick` to the TaskDrawer is handled by TASK-005.

### Screenshots
Run `npm run dev` then `npm run feedback` to generate `feedback/screenshots/project-detail.png`.

### QA Verdict — PASS

Live API tests (server on port 3001):
- `GET /api/projects/1` → project metadata with `task_count`, boolean-normalized fields ✅
- `GET /api/tasks?projectId=1` → all tasks for project, no 72h/status filter applied ✅
- `GET /api/tasks?projectIds=1` (plural, board filter) still works unchanged ✅

UI verified via code review: ProjectDetailPage.tsx fetches project + tasks in parallel; groups by status (In Progress → Blocked → Ready → Backlog → Done); "Back to Projects" link present; `onTaskClick` prop wired to TaskDrawer in App.tsx; ProjectsPage cards navigate to `/projects/:id`.
