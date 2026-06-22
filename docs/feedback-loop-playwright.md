# Playwright Visual Feedback Loop

## What It Tests

`npm run feedback` runs two screenshot-only Playwright tests against the running Vite dev server (`http://localhost:5173`):

| Test | Route | Output |
|------|-------|--------|
| Board page | `/` | `feedback/screenshots/board.png` |
| Projects page | `/projects` | `feedback/screenshots/projects.png` |

These are **visual inspection tests** — no assertions are made. The screenshots let you verify at a glance that a change hasn't broken the layout after each significant code change.

## How to Run

1. Start the dev server (in a separate terminal):
   ```bash
   npm run dev
   ```

2. Run the feedback tests:
   ```bash
   npm run feedback
   ```

Screenshots are written to `feedback/screenshots/`. Open them in any image viewer to inspect the result.

## How to Read the Output

- If the dev server is **not running**, Playwright will fail with a connection error — this is expected and harmless. Start `npm run dev` first.
- If the tests **pass**, two PNG files are created or overwritten in `feedback/screenshots/`. Open them to visually compare against the prototype in `prototypes/`.
- If a test **fails for another reason**, Playwright prints the error to the terminal. The `screenshot: 'only-on-failure'` setting in `playwright.config.ts` also captures an automatic screenshot on failure (saved to `test-results/`).

## Notes

- Screenshots are **excluded from git** (see `.gitignore`). They are generated locally on demand.
- Only the Chromium browser is used, keeping the Playwright install small.
- This loop has no assertions — it is a quick human-readable visual check, not a regression guard. Assertion-based tests are out of scope for this setup.
