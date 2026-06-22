# Build Prompt: Local Kanban Board App

## Stack
- Backend: Node.js + Express + `better-sqlite3` (local SQLite file, single-user, no auth)
- Frontend: React (Vite), single-page app, talks to local Express API
- No external services — everything runs locally

---

## Data Model

**projects**
- id, name, color (one of 12 preset theme-friendly, distinguishable colors), billable (bool), completed (bool), created_at

**tasks**
- id, project_id (FK), name, priority (1–4, default 2), notes, status (backlog | ready | in_progress | blocked | done), done_at (timestamp, set when moved to done), created_at, updated_at

**subtasks**
- id, task_id (FK), label, checked (bool) — purely informational checklist, no automation when all are checked

**blocked_reasons**
- id, task_id (FK), reason, created_at — **full history log**, one row per time a task enters "blocked" (not overwritten)

**time_sessions**
- id, task_id (FK), started_at, ended_at, minutes (derived or stored)
- One row per "in progress" session. If the tab/app is closed mid-session, count time up to that close (use `beforeunload`/heartbeat or last-active timestamp to close out the session server-side).
- Manual adjustments are stored as a `manual_adjustment_minutes` total on the task (separate ledger from session time), so auto-tracked time is never overwritten — only adjusted on top of.

---

## Pages & Layout

### Global
- Left vertical nav bar (icon + label): **Board**, **Projects**
- Thin top bar with **"+ New Task"** button, right-aligned

### Board Page
Columns, always visible (horizontal scroll on narrow viewports rather than collapsing/hiding any column), in this fixed order:
1. **Backlog** — collapsible. Expanded by default on first load; after that, remember the user's last collapsed/expanded state via a cookie.
2. **Ready**
3. **In Progress** — entering this status starts a time_session for billable tasks; leaving it (to any other status) closes out the session.
4. **Blocked** — moving a task into this column opens a modal prompting for a reason. Reason is required to confirm the move; saved to `blocked_reasons` history (not overwritten on repeat blocks).
5. **Done** — only shows tasks with `done_at` within the last 72 hours. After 72 hours, tasks disappear from this column but remain visible on their Project's sub-page (not deleted).

Behavior:
- Drag-and-drop between any two columns, in any direction.
- Within a column, tasks auto-sort by priority (1 = highest, shown first).
- Filter pills above the board: one per non-completed project, multi-select, **OR logic** (a task shows if it matches any selected project). No selection = show all.
- Responsive: columns keep a sensible min-width and the board scrolls horizontally on small/half screens rather than squishing columns unreadably.

### Projects Page
- List/grid of projects. Completed projects appear in a separate **"Completed"** section below active ones (not hidden).
- Create project: name, color (pick from 12 preset theme-friendly, visually distinguishable colors — e.g., a balanced palette covering blue/teal/green/yellow/orange/red/pink/purple/etc. at consistent saturation/lightness for theme consistency), billable toggle.
- Each project: mark as **Completed** (toggle) or **Delete** (confirmation modal required). Deleting a project **cascades**: all child tasks (and their subtasks, blocked history, time sessions) are deleted too — make the confirmation modal explicit about this ("This will also delete N tasks").
- Clicking a project navigates to its **Project Detail sub-page**.

### Project Detail Sub-Page
- Shows project info (name, color, billable flag) and all its child tasks (including tasks completed >72h ago, which no longer show on the Board).
- Accessible only via navigating from the Projects page (not in the left nav directly).

### Task Drawer (Create/Edit)
- Slides in from the right.
- Dismiss by clicking outside the drawer — **but** if there are unsaved changes, show a confirm-discard modal first.
- Fields:
  - Name
  - Parent project: pill-button picker, showing all **non-completed** projects only
  - Priority: 1/2/3/4 pill or dropdown, default 2
  - Notes (free text)
  - Subtasks: checklist (add/remove/check items)
  - **Time spent** (only shown if parent project is billable):
    - Auto-tracked total from `time_sessions` displayed as the primary value (e.g., "2h 14m" — accumulated automatically while the task sits in "In Progress," across multiple sessions)
    - Manual adjustment controls alongside it: quick chips (+5 / +15 / +30 / −5 min) plus a tap-to-edit exact-minutes field, for correcting the auto-tracked total
    - Auto-tracking and manual adjustments are both visible/auditable, not silently merged

### Blocked Modal
- Triggered on drag/drop or status-change into "Blocked"
- Single required text field: reason
- On save: appends to that task's `blocked_reasons` history and moves the task to Blocked

### Delete Confirmation Modals
- Used for: deleting a project (cascade warning, see above), deleting a task (if task deletion is exposed in the drawer — recommend adding a delete option there too, with confirmation)

---

## Visual Notes
- Priority can use a simple color-coded badge or dot (e.g., 1 = red/urgent → 4 = grey/low) rather than just a bare number, for at-a-glance scanning
- 12 project colors should be a single consistent palette (similar saturation/lightness) so any color reads as "themed" and none clashes or dominates

---

## Open Assumptions (flag if you want these changed)
- Filter pills use OR logic across selected projects
- Project color and billable flag are editable after creation (not locked at creation) — confirm if you'd rather lock billable status to avoid messing with historical time data
- No task-level delete was explicitly specified but is recommended in the drawer with confirmation, mirroring the project delete pattern
- Subtask checklist is purely informational — no automation when all items are checked
