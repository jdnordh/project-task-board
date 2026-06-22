# project-task-board

Local single-user Kanban board app. Node.js + Express + SQLite backend (`/server`), React + Vite frontend (`/client`). No auth, no cloud.

## Key Docs
- `docs/project-plan.md` — feature spec, user workflow, tech stack decisions
- `docs/architecture.md` — system overview, data model, component map
- `docs/decisions.md` — ADR log (stack choices, drag-and-drop library, etc.)
- `docs/planning.md` — task status board (PM agent owns this)
- `tasks/` — one file per task; never moved or renamed
- `prototypes/` — high-fidelity UI prototype (React + Vite, static demo data); use as visual reference for all UI tasks

## Feedback Loops
- Playwright visual screenshots: `npm run feedback` — see `docs/feedback-loop-playwright.md` (created by TASK-001)
