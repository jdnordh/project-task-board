# TASK-010 — Project Edit Drawer + Background Fix

## Context
Projects page (`ProjectsPage.tsx`) supports creating projects but has no edit capability. The existing `TaskDrawer.tsx` establishes the pattern for slide-in drawers. The app background uses an animated aurora/glow effect (`.tf-aurora` in `App.tsx` + CSS in `design-system.css`) that does not render correctly — it should be replaced with a plain dark background.

Reference files:
- `client/src/pages/ProjectsPage.tsx` — project cards + create modal
- `client/src/components/TaskDrawer.tsx` — drawer pattern to follow
- `client/src/styles/design-system.css` — aurora CSS to remove
- `client/src/App.tsx` — aurora div to remove
- `server/src/routes/projects.js` — PATCH endpoint already exists
- `docs/design-system.md` — visual reference
- `prototypes/` — UI reference

## Objective
Add an edit button to each project card that opens a slide-in drawer allowing the user to edit the project name and color. Also remove the broken aurora glow background and replace with a plain dark background.

## Acceptance Criteria

### Project Edit Drawer
- [ ] Edit button (pencil/edit icon) visible on each `ActiveProjectCard` — appears on hover or always visible
- [ ] Clicking edit button opens `ProjectDrawer` component sliding in from the right
- [ ] Drawer shows current project name pre-filled in a text input (required)
- [ ] Drawer shows the 12 preset color swatches with the current color pre-selected (same color set used in create modal)
- [ ] No billable toggle in the drawer (billable is not editable)
- [ ] Save button calls `PATCH /api/projects/:id` with `{ name, color }`
- [ ] On successful save, projects list re-fetches and drawer closes
- [ ] Dirty state: if user changes name or color and clicks outside/dismisses, show confirm-discard modal (same pattern as `TaskDrawer`)
- [ ] Drawer closes on: successful save, explicit cancel, or confirmed discard
- [ ] Edit button on `CompletedProjectRow` is optional — skip if it adds complexity

### Background Fix
- [ ] Remove the `.tf-aurora` `<div>` element from `App.tsx`
- [ ] Remove all aurora CSS from `design-system.css`: `.tf-aurora`, `.tf-aurora::before`, `.tf-aurora::after`, and the three keyframe animations (`tf-aurora-b1`, `tf-aurora-b2`, `tf-aurora-b3`)
- [ ] Body/app background renders as plain dark (use `var(--surface-0)` or equivalent — no gradients, no glows, no animation)
- [ ] All pages (Projects, Board, Project Detail) look correct with the plain dark background

## Implementation Notes
- Create `client/src/components/ProjectDrawer.tsx` — mirror the structure of `TaskDrawer.tsx` but much simpler (no subtasks, no time tracking, no project picker)
- Drawer width: 400px (slightly narrower than TaskDrawer's 440px since it has fewer fields)
- Color picker: reuse the same 12-color grid from the create modal in `ProjectsPage.tsx` — extract a shared `ColorPicker` inline component or just duplicate the pattern
- The PATCH `/api/projects/:id` endpoint in `server/src/routes/projects.js` already exists and accepts `name` and `color`; verify it validates color against the 12-color preset list
- Edit button placement: top-right corner of the card header, small icon button using `var(--text-muted)` color, hover to `var(--text-strong)`
- Do NOT change the billable field or completed status via this drawer

## Out of Scope for This Task
- Editing the billable flag
- Deleting projects
- Editing completed projects (CompletedProjectRow)
- Any changes to task editing

## Dependencies
- TASK-003 (Projects API + Projects Page) — complete

## Priority
P2
