# Architecture Decision Log

## [ADR-001] Node.js + Express + SQLite instead of ASP.NET Core + PostgreSQL
- **Date:** 2026-06-22
- **Status:** Decided
- **Context:** Jordan's typical stack is ASP.NET Core + PostgreSQL, but this is a single-user local tool with no cloud deployment and no multi-tenancy requirements.
- **Decision:** Node.js + Express backend with better-sqlite3 (SQLite local file).
- **Rationale:** Zero infrastructure overhead, trivially portable, appropriate for scope. *(interpolated from project requirements)*
- **Alternatives Considered:** ASP.NET Core + SQLite (heavier runtime for a local tool); Electron (added complexity, not needed).
- **Consequences:** Fast local setup; no migration path to multi-user without a full stack swap. Acceptable for this scope.

---

## [ADR-002] React + Vite for the frontend
- **Date:** 2026-06-22
- **Status:** Decided
- **Context:** Jordan's frontend targets include Angular + NgRx and Next.js, but this is a local SPA with no SSR or routing complexity.
- **Decision:** React + Vite.
- **Rationale:** Fast dev cycle, simplest setup for a local SPA; prototype was already built in React. *(interpolated from Jordan's patterns)*
- **Alternatives Considered:** Next.js (SSR overhead not needed for local tool); Angular (heavier setup).
- **Consequences:** No SSR; fine for local-only use.

---

## [ADR-003] dnd-kit for drag-and-drop
- **Date:** 2026-06-22
- **Status:** Superseded by ADR-007
- **Context:** Board requires drag-and-drop across 5 columns.
- **Decision:** dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`).
- **Rationale:** Actively maintained, accessible, well-suited to React. react-beautiful-dnd is in maintenance mode. *(interpolated from Jordan's patterns)*
- **Alternatives Considered:** react-beautiful-dnd (maintenance mode); custom pointer events (unnecessary complexity).
- **Consequences:** Slightly more boilerplate than rbd, but better long-term.

---

## [ADR-004] Playwright for visual feedback loop
- **Date:** 2026-06-22
- **Status:** Decided
- **Context:** Jordan uses Playwright (E2E) as standard. Project needs a visual feedback loop to catch regressions during UI-heavy development.
- **Decision:** Playwright with screenshot capture; `npm run feedback` command.
- **Rationale:** Jordan's testing standard; screenshot-based feedback loop is appropriate for this UI-first project. *(from Jordan's patterns)*
- **Alternatives Considered:** Cypress (heavier, less CLI-friendly); manual testing only (insufficient for iterative UI work).
- **Consequences:** Lightweight visual regression loop usable throughout development.

---

## [ADR-005] node:sqlite instead of better-sqlite3
- **Date:** 2026-06-22
- **Status:** Decided
- **Context:** better-sqlite3 v9.6.0 requires native compilation via node-gyp. On Node 24 + VS BuildTools 2026 (MSVC 18), the C++ standard flag `/std:c++17` overrides the required `/std:c++20`, causing the build to fail. No prebuilt binary was available for Node 24.14.1 on win32.
- **Decision:** Use Node.js built-in `node:sqlite` (`DatabaseSync`) introduced in Node 22.5 and stable in Node 24.
- **Rationale:** Zero native compilation, no external dependency, same synchronous API surface. Experimental warning is acceptable for a local-only tool.
- **Alternatives Considered:** better-sqlite3 v12+ (still requires native compilation, same MSVC issue); sql.js (WASM, no sync API); downgrading Node (unnecessary churn).
- **Consequences:** Dependency on Node ≥ 22.5. API is `DatabaseSync` from `node:sqlite` — pragmas via `db.exec('PRAGMA ...')` instead of `db.pragma(...)`.

---

## [ADR-006] Rebuild on the Cadence spec, keeping the Grove name and Tech Forest design
- **Date:** 2026-10-28
- **Status:** Decided
- **Context:** Jordan supplied a full rebuild spec ("Cadence": Board, Features, Achievements, Settings, and a Claude column that hands tasks to Claude Code). The name and design system stay.
- **Decision:** Replace the projects/time-tracking model with the spec's features/tasks/templates/activity model. Cadence identifiers become Grove ones (`grove-agent`, `scripts/grove.js`, `GROVE_TOKEN`, `grove-mutation`). Dark theme only (Tech Forest is dark-only), so there is no theme toggle. Ports 3004 (API) / 3005 (Vite).
- **Rationale:** Jordan's answers to the kickoff questions.
- **Alternatives Considered:** Keeping Cadence names internally; deriving a light theme from Mist tokens.
- **Consequences:** Billable/paid, time sessions and blocked reasons are gone. Old data is imported once from a backup copy (see architecture.md).

---

## [ADR-007] Native HTML5 drag and drop
- **Date:** 2026-10-28
- **Status:** Decided
- **Context:** The spec has no reordering within a column (order comes from the sort), only moves between columns, and the Claude column must copy a prompt using the drop's user activation.
- **Decision:** Native `draggable` + `dragover`/`drop`; dnd-kit removed.
- **Rationale:** Fewer dependencies, and the clipboard write happens inside the native drop handler before any await.
- **Consequences:** No keyboard drag; cards can still change status from the drawer.

---

## [ADR-008] Hash routing in the root component
- **Date:** 2026-10-28
- **Status:** Decided
- **Context:** Four pages, deep links like `#/achievements/a-marathon`, hidden pages that must redirect.
- **Decision:** `#/<page>/<sub…>`; `navigate()` only writes `location.hash`; the `hashchange` listener is the sole caller of `setRoute`. react-router removed.
- **Consequences:** No server routing config needed; the first segment is saved to `settings.route`.

---

## [ADR-009] Pure rule modules shared by server and client
- **Date:** 2026-10-28
- **Status:** Decided
- **Context:** Rules (templates, agent prompt/rules, page visibility, board sort, achievements) must behave the same everywhere and be unit-testable.
- **Decision:** ESM modules in `server/src/lib` with no I/O; the client imports them via `client/src/lib.ts` (`allowJs`, Vite `fs.allow`). Tested with `node --test`.
- **Consequences:** The server is now ESM (`"type": "module"`).

---

## [ADR-010] Claude sessions report through the REST API
- **Date:** 2026-10-28
- **Status:** Decided
- **Context:** Any Claude Code session, in any folder, must update its card.
- **Decision:** A stdio MCP server (`grove-agent`, registered at user scope) and a CLI fallback, both calling the REST API with the token from `.env`. Neither touches SQLite.
- **Consequences:** One writer, one set of validation. The Grove server must be running for sessions to report.

---

## [ADR-011] Achievements read an append-only activity log
- **Date:** 2026-10-28
- **Status:** Decided
- **Context:** Task rows are edited after the fact (completed_at clears when leaving Done, est is editable), so they can't prove what happened.
- **Decision:** `createTask`/`updateTask` append `task_status` events whether Extras is on or off. A task counts once, on its first completion, after ≥30s in In Progress with est > 0; est/due/priority come from the start event. Unlocks are sticky.
- **Consequences:** History from before the rebuild (imported tasks) never counts. Camo thresholds are tuned so visible achievements alone cannot reach Obsidian.

---

<!-- Copy the block above for each new ADR. Number sequentially. -->
<!-- Interpolated decisions are marked: *(interpolated from Jordan's patterns)* in the Rationale field. -->
<!-- Status values: Decided (final), Proposed (pending Jordan's approval), Superseded (replaced by a later ADR) -->
