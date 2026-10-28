# TASK-018 — Style Update: V2 Prototype

## Context
The app has an existing visual style defined in `client/src/index.css` and `client/src/design-system.css`, built against the v1 prototype (`prototypes/Grove Board.dc.html`). A v2 prototype has been placed at `prototypes/v2/` with a new design direction. The design system tokens live in `prototypes/_ds/tech-forest-design-system-*/`.

## Objective
Update the app's visual style to match the v2 prototype — colors, typography, spacing, component appearance — without changing any functionality.

## Acceptance Criteria
- [ ] All CSS custom properties (colors, typography, spacing, radius, shadow) updated to match v2 prototype
- [ ] Board page visually matches v2 prototype (columns, cards, header)
- [ ] Task drawer visually matches v2 prototype
- [ ] Projects page visually matches v2 prototype
- [ ] Project detail/edit drawer visually matches v2 prototype
- [ ] No functional regressions (drag-and-drop, time tracking, billable toggle, blocked modal all still work)
- [ ] Playwright feedback screenshots taken and attached to Completion Summary

## Implementation Notes
- Primary reference: `prototypes/v2/` — open the prototype in a browser to inspect the design
- Design tokens reference: `prototypes/_ds/tech-forest-design-system-*/tokens/*.css` and `styles.css`
- CSS entry points to update: `client/src/index.css`, `client/src/design-system.css`
- Component files likely needing updates: `client/src/App.tsx` and any component `.css` or inline styles
- Do not restructure components or change markup unless strictly necessary to achieve the visual target
- Reference `docs/design-system.md` — update it after making visual decisions so it stays in sync with code
- Run `npm run feedback` after styling changes to capture Playwright screenshots

## Out of Scope for This Task
- Any new features or functionality
- Changes to the backend or API
- New components not present in the current app

## Demo Checkpoint
Yes — after completion, Playwright screenshots of all major views should be captured and included in the Completion Summary for visual sign-off.

## Dependencies
- Requires: none
- Blocks: none

## Priority
medium
