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

## Completion Summary

Completed 2026-06-22.

**What was built:**
- `server/src/routes/projects.js` — GET, POST, PATCH, DELETE /api/projects. Validates color against 12 presets. DELETE returns `deleted_task_count`. Registered in server/src/index.js.
- `server/src/routes/tasks.js` — GET, POST, PATCH /api/tasks (built here, used fully in TASK-004). Fixed status values to use `in_progress` (underscore) matching DB schema.
- `client/src/pages/ProjectsPage.tsx` — full Projects page: active cards (color stripe, progress bar, mark complete), completed rows (reopen/delete), New Project modal (name + 12-color picker + billable toggle), Delete confirmation modal (shows task cascade count).
- `client/src/styles/design-system.css` — imports Tech Forest design system tokens.
- `client/src/App.tsx` — updated with React Router, NavRail, TopBar, /projects route wired to ProjectsPage.

**All acceptance criteria met** (API endpoints verified; UI matches prototype layout).

---

## QA Verdict — TASK-003 — 2026-06-22

> **Re-run:** Previous verdict (same date) filed 3 bugs — all dismissed by PM before this re-run:
> 1. No unit tests — architecture doc explicitly says "not planned for v1"; dismissed.
> 2. tasks.js scope overlap — handled at PM level; intentional.
> 3. TopBar hardcoded title — confirmed fixed: `App.tsx` now uses `useLocation()` with dynamic `title` variable.
>
> Shell command execution was blocked in this session; live endpoint tests could not be run. All criteria assessed by code inspection. Evidence is cited per file and line.

### Acceptance Criteria
| Criterion | Result | Notes |
|-----------|--------|-------|
| `GET /api/projects` — returns all projects ordered by created_at DESC | ✅ PASS | `projects.js` lines 40–48: LEFT JOIN with tasks, `GROUP BY p.id ORDER BY p.created_at DESC`. `created_at` has `datetime('now')` default in schema (db.js line 35), guaranteed UTC. |
| `POST /api/projects` — validates name (required), color (one of 12 presets), billable (bool) | ✅ PASS | `projects.js` lines 71–83: name checked for truthy non-empty string; color checked against `PROJECT_COLORS` array; billable type-checked if present. Returns 400 + `errors` array on any failure. `billable` omitted is accepted (defaults to false via `billable ? 1 : 0`). |
| `PATCH /api/projects/:id` — updates name, color, billable, completed | ✅ PASS | `projects.js` lines 104–151: 404 on missing id; validates each field independently; merges with existing before write. Returns updated row with `task_count`/`done_count`. |
| `DELETE /api/projects/:id` — cascades to child tasks/subtasks/blocked_reasons/time_sessions; returns `deleted_task_count` | ✅ PASS | `projects.js` lines 158–172: counts tasks before delete; returns `{ deleted_task_count }`. Cascade confirmed: `PRAGMA foreign_keys = ON` in db.js line 25; tasks table has `ON DELETE CASCADE` (db.js line 40); subtasks, blocked_reasons, time_sessions all chain `ON DELETE CASCADE` off tasks (db.js lines 52, 60, 68). 404 on missing id. |
| Projects page (`/projects`) renders list of projects matching prototype layout | ✅ PASS | `ProjectsPage.tsx` implements `ActiveProjectCard` (color stripe, icon, progress bar, mark-complete button) and `CompletedProjectRow` (color dot, name, DONE badge, reopen/delete). Matches prototype card structure. |
| Active projects and completed projects render in separate sections ("Active" / "Completed") | ✅ PASS | `ProjectsPage.tsx` lines 641–741: `active = projects.filter(p => !p.completed)`, `completed = projects.filter(p => p.completed)`. Rendered under "Active" and "Completed" uppercase section labels. |
| Create project: form/modal with name, 12-color picker, billable toggle — on submit, calls POST and refreshes list | ✅ PASS | `NewProjectModal` (lines 101–279): name input, 12-color swatch picker, billable toggle button. On submit calls `createProject()` → POST; `handleCreated` prepends returned project to state and closes modal. |
| Mark project complete: toggle button per project — calls PATCH, moves between sections | ✅ PASS | `handleComplete` (lines 644–653): calls `patchProject(id, { completed: !p.completed })`, updates local state in-place; `active`/`completed` filter re-segregates on next render. `CompletedProjectRow` reopen button calls the same handler. |
| Delete project: button opens confirmation modal explicitly stating "This will also delete N tasks" | ✅ PASS | `DeleteConfirmModal` lines 351–355: "This will also delete **N task(s)** and all their subtasks, time sessions, and blocked reasons." Uses `project.task_count` pre-fetched with the project list via the GET endpoint's LEFT JOIN aggregate. |
| 12 preset project colors implemented as consistent palette | ✅ PASS | Same 12 hex values defined in `projects.js` lines 17–30 and `ProjectsPage.tsx` lines 27–40. Server validates POST/PATCH color against its copy; client picker renders all 12. |
| React Router installed; `/projects` route renders Projects page; `/` remains placeholder | ✅ PASS | `react-router-dom ^7.18.0` in `client/package.json`. `BrowserRouter` wraps `AppShell` in `App.tsx` line 183. Routes: `/` → `BoardPage`, `/projects` → `ProjectsPage`, `/projects/:id` → stub (TASK-008). |

### Architecture Compliance
| Rule | Result | Notes |
|------|--------|-------|
| XML doc-comments on all new public classes/methods | N/A | JavaScript/TypeScript project — XML doc-comments are a .NET convention. JSDoc `/** */` block comments present on all route handlers and React components. |
| No `*Service` classes | ✅ PASS | No class name ending in `Service` anywhere in the new files. |
| UTC timestamps internally | ✅ PASS | `datetime('now')` in SQLite is UTC. `new Date().toISOString()` in tasks.js produces UTC ISO-8601. No timezone conversion inside the server layer. |
| FluentValidation for input validation | N/A | Node.js project — FluentValidation is a .NET library. Inline validation with `errors` array is used; appropriate for this scope and stack. |
| No over-abstraction | ✅ PASS | Flat route files, single `db` singleton, no unnecessary layers. |
| DI for class interactions | N/A | Functional Node.js modules; no class-based components. `db` singleton imported directly — explicitly accepted per ADR-005. |

### Tests
| Check | Result | Notes |
|-------|--------|-------|
| Tests exist for new logic | N/A | Unit/integration tests are explicitly not planned for v1 per project architecture decision (dismissed bug). Playwright visual feedback loop exists via `npm run feedback`. |
| Tests pass | ⚠️ Could not verify | Shell execution was blocked in this session. `npm run feedback` (Playwright screenshots) could not be run. No assertion-based tests exist to run. |

### Bugs Filed
None.

### Overall Verdict
PASS

### Demo Readiness
Ready to demo: Yes

### Next Steps
All criteria pass. Return to PM to mark TASK-003 `complete`.
