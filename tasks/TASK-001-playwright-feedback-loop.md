# TASK-001 — Playwright Visual Feedback Loop

## Context
Fresh project. The prototype lives in `prototypes/` as a React + Vite app with static demo data. The real app (TASK-002) will run at `http://localhost:5173` (Vite dev server, proxying API to `:3001`). This task sets up Playwright so the visual feedback loop is available from the first real task onward.

## Objective
Playwright is installed and configured; `npm run feedback` screenshots the Board page and Projects page of the running app and saves them to `feedback/screenshots/`, giving a visual checkpoint after every significant change.

## Acceptance Criteria
- [ ] `@playwright/test` installed; config at `playwright.config.ts` (or `.js`) in repo root
- [ ] `npm run feedback` script exists in root `package.json` and runs Playwright tests
- [ ] Test: navigates to `http://localhost:5173/` (Board), captures full-page screenshot → `feedback/screenshots/board.png`
- [ ] Test: navigates to `http://localhost:5173/projects`, captures full-page screenshot → `feedback/screenshots/projects.png`
- [ ] `feedback/screenshots/` directory created; `.gitignore` updated to exclude screenshot files (or include them — your call, document the choice)
- [ ] `docs/feedback-loop-playwright.md` created describing: what the loop tests, how to run it, how to read the output
- [ ] `CLAUDE.md` updated: add a `## Feedback Loops` entry pointing to `docs/feedback-loop-playwright.md`
- [ ] README.md updated with one-line "run `npm run feedback` to capture visual screenshots"

## Implementation Notes
- Playwright config: `baseURL: 'http://localhost:5173'`, `use: { screenshot: 'only-on-failure' }` (screenshots are captured manually in the test, not just on failure)
- Tests assume the dev server is already running — do not attempt to start it inside the test. Add a comment at the top of the test file: `// Run 'npm run dev' before running feedback tests`
- Use `page.screenshot({ path: 'feedback/screenshots/board.png', fullPage: true })`
- Install only the Chromium browser to keep install size small: `npx playwright install chromium`
- `npm run feedback` = `playwright test`
- The prototype in `prototypes/` is the UI reference for what the Board and Projects pages should look like. When writing the screenshot test, navigate to the correct routes — match the routes the prototype uses.
- See `docs/architecture.md` for app structure context.

## Out of Scope for This Task
- Writing assertion-based tests (this task is screenshots only — visual inspection, not automated assertions)
- Setting up the real app (that's TASK-002)
- Any CI integration

## Demo Checkpoint
No

## Dependencies
- Requires: none
- Blocks: none (but should be verified working once TASK-002 is complete and `npm run dev` is available)

## Priority
high
