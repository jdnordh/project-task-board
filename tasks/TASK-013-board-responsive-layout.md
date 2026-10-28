# TASK-013 Board Responsive Layout (Half-Monitor)

## Context

The board page is unusable at ~960px wide (half a 1920px monitor). With Backlog collapsed the board tries to render 4 columns at 280px each (fixed, `flexShrink: 0`) plus the 212px NavRail, 56px of horizontal padding, and gaps — totalling well over 1400px. The board scrolls horizontally instead of fitting the viewport.

**Target viewport:** ~960px wide (half a standard 1920px monitor). At that width the user should see all 4 active columns (Ready, In Progress, Blocked, Done) without horizontal scrolling. Backlog collapsed is the normal working state; that case must fit cleanly. Backlog expanded can scroll horizontally — that is acceptable.

## Objective

Make the board columns flex to fill available width at narrow viewports while preserving the prototype's visual design at wider screens (≥1400px).

## Acceptance Criteria

- [ ] At 960px viewport width with Backlog collapsed: all 4 columns (Ready, In Progress, Blocked, Done) are fully visible without horizontal scrolling
- [ ] At 960px viewport width with Backlog expanded: horizontal scroll is acceptable (5 columns won't fit — that is OK)
- [ ] At ≥1400px viewport width: columns are at least 260px wide (visual quality preserved)
- [ ] Column cards and text do not overflow or clip at 200px minimum column width
- [ ] Drag-and-drop still functions correctly after layout changes
- [ ] NavRail renders correctly and does not overlap board content

## Implementation Notes

### Root cause
`BoardColumn` renders with `flexShrink: 0, width: 280px` — columns never shrink. Fix: replace fixed width with flexible sizing.

### Suggested changes in `client/src/pages/BoardPage.tsx`

**Expanded column** (line ~491):
```tsx
// Before
<div style={{ flexShrink: 0, width: 280, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

// After  
<div style={{ flex: '1 1 220px', minWidth: 200, maxWidth: 340, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
```

**Collapsed backlog column** (line ~431) — keep fixed at 48px, no change needed.

**Board scroll container** (line ~1049) — ensure `alignItems: 'stretch'` remains and `overflowX: 'auto'` stays as fallback. Reduce horizontal padding from 28px to 16px at this level (currently `'4px 28px 26px'`) to reclaim ~24px per side:
```tsx
padding: '4px 16px 26px',
```

**NavRail** in `client/src/App.tsx` (line ~29) — reduce width from 212px to 180px:
```tsx
width: 180,
```

**Filter pills** (line ~641) — match reduced padding:
```tsx
padding: '16px 16px 14px',
```

### Math check at 960px after changes
- NavRail: 180px
- Board area: 960 − 180 = 780px
- Padding: 16 × 2 = 32px
- Available: 780 − 32 = 748px
- Backlog collapsed (48px) + gap (16px) = 64px
- Remaining for 4 columns + 3 gaps: 748 − 64 = 684px
- Per column: (684 − 48) / 4 = **159px** — below min-width of 200px, so columns will scroll

Revise: drop `gap` to `10px` and increase padding to `'4px 12px 26px'`:
- Padding: 12 × 2 = 24px  
- Available: 780 − 24 = 756px
- Backlog collapsed: 48 + 10 = 58px
- 4 cols + 3 gaps: 756 − 58 = 698px, gap contribution = 30px → 4 cols = 668px → 167px each

Still below 200px min. The real fix: use `minWidth: 160px` for columns and accept slight compression, OR reduce NavRail further to 160px:

- NavRail 160px → board area 800px, padding 24px → available 776px
- Backlog (48+10): 756px for 4 cols + 3 gaps (30px) = 726/4 = **181px each** — workable

**Recommended final values:**
- NavRail width: `160px`
- Column: `flex: '1 1 180px'`, `minWidth: 160px`, `maxWidth: 340px`
- Board padding: `'4px 12px 26px'`
- Board gap: `10px`
- Filter pill padding: `'14px 12px 12px'`

Verify the math holds by running the app at 960px after implementing.

### Design constraints
- Do NOT change column card internal layout, font sizes, or visual tokens
- Do NOT add media queries — flexbox sizing is sufficient
- Do NOT break the prototype design at wide screens (≥1400px columns will hit maxWidth 340px)

## Out of Scope for This Task

- Mobile/touch breakpoints
- Responsive NavRail collapse (icon-only mode)
- Column reordering

## Dependencies

none

## Priority

P2
