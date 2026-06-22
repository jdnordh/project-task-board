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
- **Status:** Decided
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

<!-- Copy the block above for each new ADR. Number sequentially. -->
<!-- Interpolated decisions are marked: *(interpolated from Jordan's patterns)* in the Rationale field. -->
<!-- Status values: Decided (final), Proposed (pending Jordan's approval), Superseded (replaced by a later ADR) -->
