# TASK-012 — Favicon (Browser Tab Icon)

## Context
The app currently uses the default Vite placeholder favicon (`/vite.svg`). The app is named "Grove Board" and uses a living-green accent color (`#4ADE80`, CSS token `--canopy-400`) on a dark background (`--surface-0` ≈ `#0D1117`). There are no existing logo assets.

Reference files:
- `client/index.html` — current favicon link (`<link rel="icon" type="image/svg+xml" href="/vite.svg" />`)
- `client/src/styles/design-system.css` — color tokens (accent `#4ADE80`, surface `#0D1117`)
- `client/public/` — static assets directory (where favicon belongs)

## Objective
Design and ship a simple favicon that represents Grove Board in browser tabs. Replace the Vite placeholder with a custom ICO/SVG that looks good at 16×16 and 32×32 sizes.

## Acceptance Criteria
- [ ] Favicon is a simple, recognizable mark — a small kanban-board-style icon or stylized "G" using the green accent (`#4ADE80`) on a dark/transparent background
- [ ] SVG favicon created at `client/public/favicon.svg` — crisp at 16px, readable at 32px
- [ ] ICO file created at `client/public/favicon.ico` — generated from the SVG (16×16 and 32×32 embedded); use a tool or script to produce it (e.g. `sharp`, `png2ico`, or similar npm package available in the project)
- [ ] `client/index.html` updated: primary `<link rel="icon">` points to `/favicon.svg`; fallback `<link rel="icon" sizes="any">` points to `/favicon.ico`
- [ ] Old `client/public/vite.svg` removed (or left — acceptable if it's outside `public/`)
- [ ] Tab shows the new icon when the dev server is running

## Implementation Notes
- Keep the icon simple — fine detail is lost at 16px. A single bold shape beats a complex illustration.
- Suggested design: three horizontal bars of different widths (kanban column silhouette) in `#4ADE80` on a rounded dark square (`#0D1117` or transparent). Alternative: bold letter "G" in accent green on dark rounded square.
- For ICO generation without native tools: install `sharp` as a dev dependency (`npm install --save-dev sharp`) and write a one-off `scripts/gen-favicon.mjs` that reads the SVG, rasterizes to PNG at 16 and 32, then packs into ICO using `to-ico` or similar. Delete the script after use or keep it in `scripts/` for future re-generation.
- Preferred HTML link tags order:
  ```html
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" sizes="any" href="/favicon.ico" />
  ```

## Out of Scope for This Task
- Apple touch icon / PWA manifest icons
- Animated favicon
- Full logo / wordmark for the app header

## Dependencies
- TASK-002 (scaffold) — complete

## Priority
P3
