# Project Plan — Local Kanban Board

## Overview
Single-user local task management app with a Kanban board UI. Node.js + Express + SQLite backend, React + Vite frontend. No auth, no external services — everything runs locally.

## User Workflow

**Happy path (Board):**
1. User opens app to Board page — active tasks spread across 5 columns
2. User drags task from Backlog → Ready when actionable
3. User drags task to In Progress — time session auto-starts if project is billable
4. User drags task to Blocked — required reason modal appears; reason saved to history
5. User drags task to Done — `done_at` set; task visible in Done column for 72h, then falls off board (still on Project Detail)

**Happy path (Projects):**
1. User creates project (name, color, billable toggle)
2. User views all tasks for project on Project Detail sub-page, including done tasks older than 72h
3. User marks project Completed or deletes it (cascade confirmation shows task count)

**Edge cases / failure paths:**
- Tab/app closed mid-session: server closes active time session via beforeunload or heartbeat
- Dragging to Blocked without reason: confirm button disabled until reason entered
- Clicking outside drawer with unsaved changes: confirm-discard modal required
- Deleting project: modal explicitly states "This will also delete N tasks"

## Goals
- Fast, frictionless local Kanban with no auth or cloud friction
- Accurate billable time tracking across multiple In Progress sessions per task
- Full blocked-reason history (never overwritten on repeat blocks)

## Out of Scope (This Phase)
- Multi-user, cloud sync, auth
- Time report exports
- Time UI on non-billable tasks (hidden)
- Notifications or reminders

## Tech Stack
| Layer | Choice | Rationale |
|---|---|---|
| Backend | Node.js + Express | Lightweight, local-only, no cloud infra needed |
| Database | better-sqlite3 (SQLite) | Single-user, local file, zero infra |
| Frontend | React + Vite | Fast dev cycle; Jordan's frontend preference |
| Drag-and-drop | dnd-kit | Modern, accessible, actively maintained |
| E2E / Visual | Playwright | Jordan's testing standard; visual regression via screenshots |

## Architecture Summary
React SPA talks to local Express API via Vite dev proxy. SQLite file initialized on server startup. Time sessions opened/closed by API on status transitions; tab-close handled via beforeunload signal or heartbeat.

## Milestones
| # | Milestone | Demo? | Est. Effort |
|---|-----------|-------|-------------|
| 1 | Playwright feedback loop + project scaffold | No | S |
| 2 | Projects page + Board page wired to real data | Yes | M |
| 3 | Task Drawer + Blocked modal | Yes | M |
| 4 | Time tracking + Project Detail sub-page | Yes | M |

## Open Questions
- Project color + billable flag: editable after creation? (Current assumption: yes — flag if billable lock preferred to protect time history)
- Task deletion in drawer: current assumption is yes, with confirmation modal

## Assumptions Made
- Filter pills use OR logic across selected projects
- Color and billable flag are editable post-creation
- Task delete exposed in drawer with confirmation modal
- Subtask checklist is purely informational (no automation on all-checked)
- dnd-kit chosen for drag-and-drop
