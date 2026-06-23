# TASK-015 — Project Billable Toggle in Edit Drawer

## Context

`PATCH /api/projects/:id` already accepts `{ billable: boolean }` and persists it correctly (`server/src/routes/projects.js` lines ~101–146). However, `ProjectDrawer.tsx` only edits `name` and `color` — there is no UI for changing `billable`. Jordan wants to be able to toggle this from the edit drawer.

## Objective

Add a billable toggle to the Project Edit Drawer so users can change a project's billable status.

## Acceptance Criteria

- [x] Project Edit Drawer loads the current `billable` value from `GET /api/projects/:id` (or from the project list response already used)
- [x] Drawer displays a toggle/checkbox for "Billable" with clear labeling
- [x] Toggling marks the drawer as dirty (triggers confirm-discard if closed without saving)
- [x] Saving via the existing Save button includes `billable` in the PATCH body
- [x] After save, the projects list re-fetches and reflects the updated billable status
- [x] Visual style of the toggle matches the Grove design system (see `docs/design-system.md`)

## Implementation Notes

### `client/src/components/ProjectDrawer.tsx`

**`DrawerDraft` type** — add `billable`:
```ts
interface DrawerDraft {
  name: string
  color: string
  billable: boolean
}
```

**`GET /api/projects/:id` response** — already includes `billable` (see `server/src/routes/projects.js` line ~54). The drawer fetches this on open; just include it in the initial draft state.

**Toggle UI** — add below the color picker. Use a simple toggle switch matching Grove tokens. Pattern:

```tsx
{/* Billable toggle */}
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
  <div>
    <div style={labelStyle}>Billable</div>
    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
      Track time on tasks in this project
    </div>
  </div>
  <button
    role="switch"
    aria-checked={draft.billable}
    onClick={() => setDraft(d => ({ ...d, billable: !d.billable }))}
    style={{
      width: 44, height: 24, borderRadius: 12, flexShrink: 0,
      border: 'none', cursor: 'pointer',
      background: draft.billable ? 'var(--canopy-400)' : 'var(--surface-3)',
      position: 'relative',
      transition: 'background var(--dur-fast) var(--ease-grow)',
    }}
  >
    <span style={{
      position: 'absolute', top: 3, borderRadius: '50%',
      width: 18, height: 18, background: 'var(--text-strong)',
      left: draft.billable ? 23 : 3,
      transition: 'left var(--dur-fast) var(--ease-grow)',
    }} />
  </button>
</div>
```

**PATCH body** — include `billable` in the save call:
```ts
body: JSON.stringify({ name: draft.name.trim(), color: draft.color, billable: draft.billable })
```

**isDirty check** — ensure `billable` is included in the dirty comparison so toggling marks the drawer dirty.

### Note on loaded project data

The drawer currently fetches the project from the API when it opens. Verify the response shape includes `billable: boolean` — it does (confirmed in `server/src/routes/projects.js` line ~54 and ~146). Initialize `draft.billable` from this response.

## Out of Scope for This Task

- Visual indication of billable status on project cards/list beyond the drawer
- Bulk-editing billable status

## Dependencies

none (but conceptually pairs with TASK-014)

## Priority

P2

## Completion Summary

### What was built

**File changed:** `client/src/components/ProjectDrawer.tsx`

- `DrawerDraft` interface extended with `billable: boolean`.
- Initial draft state set to `billable: false`; the load effect initializes it from `!!data.billable` (handles SQLite integer 0/1 as well as boolean).
- Baseline is set from the same full `DrawerDraft` object, so `isDirty` (`JSON.stringify(draft) !== baseline`) automatically covers `billable` — no extra logic needed.
- Toggle switch UI added below the color picker using `role="switch"` + `aria-checked`, Grove tokens (`--canopy-400`, `--surface-3`, `--text-strong`, `--dur-fast`, `--ease-grow`), and an animated thumb.
- PATCH body updated to include `billable: draft.billable`.
- `onSaved()` is called on success, which triggers the project list re-fetch in the parent.

### Feedback loops run

- `npm run feedback` — 3/3 Playwright tests passed.

### Deviations

None. Implementation followed the task spec exactly.

### New ADRs

None.

### Follow-up tasks

None.
