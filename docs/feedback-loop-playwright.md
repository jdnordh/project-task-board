# Playwright Visual Feedback Loop

## What It Tests

`npm run feedback` runs screenshot-only Playwright tests against the running dev server (`http://localhost:3005`):

| Test | Route | Output |
|------|-------|--------|
| Board page | `#/board` | `feedback/screenshots/board.png` |
| Features page | `#/features` | `feedback/screenshots/features.png` |
| Settings page | `#/settings` | `feedback/screenshots/settings.png` |
| Task drawer (new task, not saved) | `#/board` | `feedback/screenshots/drawer.png` |

These are **visual inspection tests**: no assertions and no writes. Rules are covered by `npm test`.

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
