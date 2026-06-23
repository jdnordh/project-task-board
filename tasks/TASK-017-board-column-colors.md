# TASK-017 — Board Column Dot Color Adjustments

## Context

Board column accent colors don't read as distinctly as Jordan wants. The current palette:

| Column | Current | Change |
|--------|---------|--------|
| Backlog | `#74897b` (muted sage-green) | → neutral gray |
| Ready | `#45d3bb` (teal/cyan) | → blue |
| In Progress | `#4ade80` (medium green) | → noticeably lighter green |
| Blocked | `#f0876a` (coral) | stays |
| Done | `#86efac` (light mint) | stays |

## Objective

Swap the three accent colors in `COLUMNS` (BoardPage) and `STATUS_MAP` (ProjectDetailPage). No other visual changes.

## Acceptance Criteria

- [x] Backlog column dot is a neutral gray (not green-tinted)
- [x] Ready column dot is blue (clearly distinct from green palette)
- [x] In Progress column dot is a lighter green than current `#4ade80`, visually distinct from Done (`#86efac`)
- [x] Blocked and Done dots unchanged
- [x] `STATUS_MAP` in `ProjectDetailPage.tsx` updated to match
- [x] No other styles changed (headBg tints that reference these colors should also be updated to match new accents)

## Implementation Notes

### Suggested new values

| Column | New accent | Notes |
|--------|-----------|-------|
| Backlog | `#9ca3af` | Tailwind gray-400 — neutral, clearly not status-colored |
| Ready | `#60a5fa` | Tailwind blue-400 — unambiguous blue |
| In Progress | `#6ee7b7` | Tailwind emerald-300 — lighter than `#4ade80`, distinct from Done `#86efac` |

Verify these look correct in the running app. If `#6ee7b7` is too close to Done visually, try `#34d399` (emerald-400, slightly different hue from the existing greens).

### Touch points

**`client/src/pages/BoardPage.tsx` — `COLUMNS` array (lines ~55–96)**

Update `accent` for backlog, ready, in_progress. Also update `headBg` for in_progress and ready — these reference the accent at low opacity:
```tsx
// in_progress headBg currently: 'rgba(74,222,128,0.04)'
// after → 'rgba(110,231,183,0.04)'  (matches new #6ee7b7)

// ready headBg currently: 'var(--surface-1)'
// ready has no tinted headBg — leave as-is or leave as var(--surface-1)
```

**`client/src/pages/ProjectDetailPage.tsx` — `STATUS_MAP` (lines ~55–61)**

Mirror the same three color values:
```tsx
const STATUS_MAP = {
  backlog:     { label: 'Backlog',     color: '#9ca3af' },
  ready:       { label: 'Ready',       color: '#60a5fa' },
  in_progress: { label: 'In Progress', color: '#6ee7b7' },
  blocked:     { label: 'Blocked',     color: '#f0876a' },  // unchanged
  done:        { label: 'Done',        color: '#86efac' },  // unchanged
}
```

### Design constraints
- Do NOT change card styles, padding, typography, or any token values
- Only change the accent color literals and the headBg rgba that derives from them

## Out of Scope for This Task

- Dark/light mode color adjustments
- Priority badge colors
- Project color picker palette

## Dependencies

none

## Priority

P3

## Completion Summary

**Completed:** 2026-06-23
**Commit:** d7826e0

Swapped three column accent colors in `COLUMNS` (BoardPage.tsx) and `STATUS_MAP` (ProjectDetailPage.tsx):

| Column | Before | After |
|--------|--------|-------|
| Backlog | `#74897b` (sage-green) | `#9ca3af` (neutral gray) |
| Ready | `#45d3bb` (teal/cyan) | `#60a5fa` (blue) |
| In Progress | `#4ade80` (medium green) | `#6ee7b7` (lighter emerald) |
| Blocked | `#f0876a` | unchanged |
| Done | `#86efac` | unchanged |

Also updated the `headBg` rgba for In Progress from `rgba(74,222,128,0.04)` to `rgba(110,231,183,0.04)` to match the new accent. Verified visually via Playwright screenshot — all five dots are clearly distinct.
