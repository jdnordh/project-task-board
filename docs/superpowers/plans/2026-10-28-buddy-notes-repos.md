# Buddy, Notes, Repos, Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repo selection, description images, meeting notes and the Buddy orchestrator (MCP tools + skill) to Grove.

**Architecture:** Rules go in pure modules under `server/src/lib/` (tested with `node --test`, re-exported via `client/src/lib.ts`). `store.js` does the I/O, `app.js` the routes, MCP servers and the CLI talk REST only. The client adds a Notes page and dropdowns; the skill is markdown in `.claude/skills/buddy/`.

**Tech Stack:** Node + Express + `node:sqlite`, React 18 + Vite + TipTap 3 (`@tiptap/extension-list` already present; add `@tiptap/extension-image`), `@modelcontextprotocol/sdk` + zod.

**Spec:** `docs/superpowers/specs/2026-10-28-buddy-notes-repos-design.md` (and the user's `buddy-skill-spec.md`, summarised there).

## Global Constraints

- Dates are local `YYYY-MM-DD`; "today" from `localDate()` in `lib/dates.js`, never `toISOString().slice(0,10)`.
- Agent notes ≤ 280 chars; reports replace whole.
- Buddy-created tasks: status only `backlog` or `week`.
- Notes are never in `/api/state`; note list rows never carry `body_html` or `transcript`.
- Images: png/jpeg/gif/webp only, ≤ 5 MB, magic bytes checked, never SVG.
- Ids via `genId(prefix)`: notes `n`, images `img`.
- Commit after each task (user memory: always commit).

## Review Focus

1. Existing `grove.db` without the new columns/tables → migration adds them, app boots (test: open a DB made with the old schema, then `openDb` again).
2. `repos_base` unset, missing, or a file → `GET /api/repos` returns `{repos: [], error}` with 200 (test in Task 1).
3. Search with no `q` hides older notes; with `q` finds a 2-year-old note (test in Task 3).
4. Deleting a feature keeps its notes with `feature_id` null (test in Task 4).
5. Image upload with a png `Content-Type` but HTML bytes → 400 (test in Task 2).

---

### Task 1: Repo selection (server)

**Files:**
- Create: `server/src/lib/repos.js` (pure: `resolveRepo`) and `server/src/repos.js` (I/O: `scanRepos`)
- Modify: `server/src/db.js` (migration helper), `server/src/store.js`, `server/src/app.js`, `server/src/lib/agent.js`
- Test: `server/test/lib.test.js`, `server/test/api.test.js`

**Interfaces:**
- Produces: `resolveRepo(task, feature) -> string|null` (task's `repo_path` ?? feature's ?? null), exported from `lib/agent.js` beside `claudeSetup`. `scanRepos(base: string) -> {base, repos: {name, path}[], error?: string}` (direct children with a `.git` dir or file, sorted by name, paths with forward slashes). `features.repo_path`, `tasks.repo_path` columns; `repo_path` accepted by createFeature/updateFeature and in `TASK_FIELDS` (null or absolute path string, else 400). `GET /api/repos` reads setting `repos_base`. `agentView` adds `repo_path` (resolved).
- `db.js`: `migrate(db)` runs after `SCHEMA`; adds a column only when `PRAGMA table_info` lacks it.

- [ ] Step 1: tests — `resolveRepo({repo_path:'C:/a'},{repo_path:'C:/b'})==='C:/a'`, `resolveRepo({repo_path:null},{repo_path:'C:/b'})==='C:/b'`, both null → null; API: make tmp base with `r1/.git/` dir, `r2/.git` file, `plain/`; PATCH settings `repos_base`; `GET /api/repos` → names `['r1','r2']`; base `'C:/nope'` → 200, `repos: []`, `error` set; PATCH task `repo_path: 'relative'` → 400; old-schema DB file (create with features table lacking repo_path) reopened via `openDb` has the column.
- [ ] Step 2: run `npm test`, expect FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: `npm test` PASS.
- [ ] Step 5: commit `feat(server): repo base folder scan and repo on features/tasks`.

### Task 2: Description images (server + CLI)

**Files:**
- Create: `server/src/lib/images.js` (pure: `sniffImage(buf) -> mime|null`, `imageIds(html) -> string[]`)
- Modify: `db.js` (`images` table), `store.js`, `app.js`, `lib/desc.js` (`<img>` → `[image]`), `lib/agent.js` (rules 12–13, CLI + MCP forms), `scripts/grove.js`
- Test: `lib.test.js`, `api.test.js`

**Interfaces:**
- Produces: `POST /api/images` (`express.raw({type: () => true, limit: '5mb'})`, originOnly) → 201 `{id, url}`; `GET /api/images/:id` (stored mime, `nosniff`, `Cache-Control: private, max-age=31536000, immutable`); `GET /api/tasks/:id/images` → `[{id, url, mime}]` in description order; `POST /api/tasks/:id/report-image` (gated) body `{path, caption}` → `{id, url, markdown: "![caption](/api/images/<id>)"}`. Store: `saveImage(buf) -> {id,url}`, `imageContent(id) -> {mime, bytes}`, `taskImages(taskId)`, `uploadImageFile(path, caption)`.
- `imageIds` matches `src="/api/images/<id>"` (also absolute `http://localhost:<port>/api/images/<id>`).
- Rules (agentRules): 11. `[image]` in the description means a picture: get it with `get_task_images` (CLI `task-images <id> [dir]`) and open it. 12. To show a picture in the report, upload it with `upload_report_image` (CLI `task-image <id> <file> --caption=..`) and use the line it returns; the report shows only uploaded pictures.
- CLI: `task-images` GETs the list then downloads each to `dir` (default `os.tmpdir()/grove-images/<id>`), prints paths; `task-image` POSTs report-image.

- [ ] Step 1: tests — `sniffImage` on PNG/JPEG/GIF/WebP magic → mimes, on `<svg` and `<html` → null; `stripHtml('<p>a<img src="/api/images/x">b</p>')==='a[image]b'`; `imageIds` order; API: upload 1×1 PNG → 201, GET returns same bytes + `image/png`; upload HTML bytes with png header → 400; >5 MB → 413; task with that img in `desc_html` → `GET /tasks/:id/images` lists it; report-image with `.txt` path → 400; agentRules contains `get_task_images` and CLI form contains `task-images`.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS.
- [ ] Step 5: commit `feat: images in task descriptions and reports`.

### Task 3: Notes rules (pure)

**Files:**
- Create: `server/src/lib/notes.js`
- Test: `server/test/notes.test.js`

**Interfaces:**
- Produces: `noteText(html) -> string`; `countActions(html) -> {open, total}`; `excerpt(text, word, len=200) -> string`; `searchNotes(notes, {q, from, to, feature, today}) -> rows` where `notes` are full rows and each result is `{id, title, meeting_date, feature_id, created_at, updated_at, actions:{open,total}, has_transcript, excerpt}`; `NOTE_DEFAULT_DAYS = 14`; `addDays(ymd, n) -> ymd` (or reuse from `lib/dates.js` if present).
- `noteText`: TipTap task item `<li data-type="taskItem" data-checked="true">…</li>` → `[x] text`, false → `[ ] text`; links and images per `stripHtml`. Build on `stripHtml` (pre-replace task items) rather than a second converter.

- [ ] Step 1: tests — noteText of a two-item task list → lines `[ ] Call Sam`, `[x] Send deck`; `countActions` → `{open:1,total:2}`; search no q, today `2026-10-28`: note dated `2026-10-10` excluded, `2026-10-14` included; q `"budget sam"` matches only note containing both words (case-insensitive), across dates; word only in transcript → excerpt from transcript; `feature:'none'` returns only null-feature notes; sort by meeting_date desc then updated_at desc; results have no `body_html`/`transcript` keys.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS.
- [ ] Step 5: commit `feat(lib): meeting notes text, action counts and search`.

### Task 4: Notes store + API

**Files:**
- Modify: `db.js` (`notes` table, `feature_id … REFERENCES features(id) ON DELETE SET NULL`), `store.js`, `app.js`
- Test: `api.test.js`

**Interfaces:**
- Consumes: Task 3.
- Produces: `GET /api/notes?q&from&to&feature` → search rows; `GET /api/notes/:id` → full note + `feature_name` + `actions`; `POST /api/notes` `{title?, meeting_date?, feature_id?, body_html?, transcript?}` → 201 note (title default `'Untitled meeting'`, date default today); `PATCH /api/notes/:id` same fields → note; `DELETE` → 204. `body_text` always `noteText(body_html)`; client-sent `body_text` ignored. `meeting_date` must be a real calendar date. Unknown `feature_id` → 400.

- [ ] Step 1: tests — create/patch round trip, `body_text` derived; deleting the feature leaves note with `feature_id` null; `/api/state` has no `notes` key; invalid date `2026-02-30` → 400.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS.
- [ ] Step 5: commit `feat(server): meeting notes API`.

### Task 5: MCP — shared client, note tools, image tools, Buddy server

**Files:**
- Create: `server/mcp/client.js` (from agent-server's `call`, `text`, `tool`), `server/mcp/format.js` (text formatters below), `server/mcp/buddy-server.js`, `server/src/lib/buddy.js`, `.mcp.json`
- Modify: `server/mcp/agent-server.js`, `server/src/store.js` + `app.js` (delegate endpoint), `server/package.json` if needed
- Test: `server/test/mcp.test.js`, `server/test/buddy.test.js`, `api.test.js`

**Interfaces:**
- `lib/buddy.js`: `BUDDY_TASK_FIELDS = ['title','feature','priority','est','due','status','desc','subtasks']`; `checkBuddyTask(input, features) -> {value} | {error}` — unknown field → error naming it; feature by id or case-insensitive name, else error `Unknown feature "x". Features: A, B`; status default `backlog`, only `backlog|week`; `due` real calendar date; `subtasks: string[]` → `[{t, done:false}]`; omits `est` when absent. `isRealDate(ymd) -> boolean` (put in `lib/dates.js` if not already there; Task 4 uses it too). `claudeLine(task, now)` for `list_claude_tasks`.
- `POST /api/tasks/:id/delegate` → `updateTask(id,{status:'claude'})` then `{task_id, title, feature_name, prompt, session_title, setup_label, model, effort, repo_path, had_report, file_ids}`.
- `format.js`: `featureLine(f, counts)` → `id name [completed] (open of total tasks)` + ` · repo <path>` when set; `taskLine(t, featureName)`; `noteLine(row, featureName)` → `id · date · title [Feature] (open/total open)` + newline + excerpt; `formatNote(note)` with `--- Transcript ---`; `claudeLine`.
- `grove-agent` adds `get_task_images {task_id, save_to_dir?}`, `upload_report_image {task_id, path, caption}`, `search_meeting_notes {q?, from?, to?, feature?}`, `get_meeting_note {id}`.
- `grove-buddy`: `get_profile`, `list_features`, `list_tasks {status?: string[], overdue?: bool, limit?: number}` (default all statuses but `done`), `get_task`, `search_meeting_notes`, `get_meeting_note`, `create_task` (zod `.strict()` plus `checkBuddyTask`), `delegate_task`, `list_claude_tasks {all?}` (order via `agentRank`), `read_task_file {file_id, save_to?}` (60,000-char cap). Server instructions: one paragraph saying it is Buddy's tool set and to load the `buddy` skill.
- `.mcp.json`: `{"mcpServers":{"grove-buddy":{"command":"node","args":["server/mcp/buddy-server.js"]}}}`.

- [ ] Step 1: tests — checkBuddyTask: `{title:'x', feature:'core'}` resolves `Core` id; `{…, foo:1}` error mentions `foo`; status `progress` error; due `2026-02-30` error; unknown feature error lists names. format: noteLine/featureLine exact strings; claude ordering question before running. API: delegate moves a `backlog` task to `claude`, clears agent state, returns prompt starting `Please work on my Grove task`, `repo_path` from the feature.
- [ ] Step 2: FAIL. Step 3: implement. Step 4: PASS; also smoke-start both servers: `node server/mcp/buddy-server.js < /dev/null` exits cleanly.
- [ ] Step 5: commit `feat(mcp): grove-buddy server, note and image tools`.

### Task 6: Client — settings, repo pickers, image editor

**Files:**
- Modify: `client/package.json` (add `@tiptap/extension-image`), `client/src/types.ts`, `client/src/api.ts`, `client/src/lib.ts`, `pages/SettingsPage.tsx`, `pages/FeaturesPage.tsx`, `components/TaskDrawer.tsx`, `components/NotesEditor.tsx`
- Create: `client/src/components/RepoPicker.tsx`

**Interfaces:**
- `RepoPicker({value, onChange, inheritLabel?})` — loads `GET /api/repos` once (module cache), options: inherit/None, repos, and current value marked "(not found)" if absent.
- `NotesEditor` gains props `taskList?: boolean` and always registers Image (`allowBase64: false`); paste/drop handler uploads image files via `api.uploadImage(file) -> {id,url}` and inserts the node.
- Settings: "Repos base folder" text field + found count + Rescan.

- [ ] Step 1: `npm --prefix client i @tiptap/extension-image`.
- [ ] Step 2: implement.
- [ ] Step 3: `npm run typecheck` passes.
- [ ] Step 4: browser check (preview `grove`): set base to `C:/Users/Jordan/source/repos`, repo dropdown on a feature lists repos; paste an image into a task description, reload, it persists.
- [ ] Step 5: commit `feat(client): repo pickers, base folder setting, image paste`.

### Task 7: Client — Notes page

**Files:**
- Create: `client/src/pages/NotesPage.tsx` (list + detail)
- Modify: `server/src/lib/pages.js` (add `{id:'notes', label:'Notes', icon:'notebook-pen'}` after features), `client/src/App.tsx` (route `notes`, pass features + `createTask`), `client/src/api.ts`, `client/src/types.ts`, `components/Icon.tsx` if icon map needs it, `server/test/lib.test.js` if a pages test enumerates PAGES

**Interfaces:**
- List: from/to date inputs (default today−14..today, cleared when searching per server rule — send `from/to` only if user changed them), search (debounced 250 ms), FeatureFilter-like select incl. "No feature", New note → POST then `#/notes/<id>`.
- Detail `#/notes/<id>`: title, date, feature picker, `NotesEditor taskList`, collapsible transcript textarea; autosave 1500 ms after last change, on blur, on unmount, on `beforeunload` (`navigator.sendBeacon` not needed — use `fetch(..., {keepalive:true})`); open action items side list from the editor's current HTML with **Promote to task** → if no feature, FeaturePicker popover; creates backlog task `{title: item, feature, desc: 'From meeting note "<title>" (<date>): #/notes/<id>'}`; delete note button with confirm.

- [ ] Step 1: implement.
- [ ] Step 2: `npm run typecheck` and `npm test` pass.
- [ ] Step 3: browser check: create note, add 2 action items, wait 2 s, reload → persisted; list shows `1/2`-style count; promote creates a card on Board backlog.
- [ ] Step 4: commit `feat(client): meeting notes page`.

### Task 8: Buddy skill

**Files:**
- Create: `.claude/skills/buddy/SKILL.md`, `.claude/skills/buddy/sources/10-meetings.md`, `20-unfinished.md`, `30-features.md`
- Create: `server/test/buddy-skill.test.js`
- Modify: `CLAUDE.md` (one line: Buddy skill + grove-buddy), `docs/architecture.md` (notes, images, repos, buddy server)

**Interfaces:**
- SKILL.md frontmatter `name: buddy`, description triggering on "buddy", "what next", orchestrate/delegate requests. Body = spec §4–7 adapted: Grove names, `grove-buddy` tools, Folder column = resolved `repo_path` or ask; worker start per design §6 (Remote Control check via `get_session("self").remoteControlState`, `start_session` params, trust-prompt warning, extra prompt line, subagent fallback); Pull step image link base `http://localhost:3005`; hard rules; no design docs.
- Each source has headings `## Title`, `## Needs`, `## Skip when`, `## Gather`, `## Write`.

- [ ] Step 1: test — for every `*.md` in `sources/`, all five headings present; at least the three files exist, sorted names `10-…`,`20-…`,`30-…`; SKILL.md has `name: buddy`.
- [ ] Step 2: FAIL. Step 3: write files. Step 4: PASS.
- [ ] Step 5: commit `feat: Buddy orchestrator skill`.

### Task 9: Final verification

- [ ] `npm test`, `npm run typecheck` green.
- [ ] `npm run feedback` (Playwright) still passes or diffs are only the new sidebar item.
- [ ] Final review of the whole branch against the spec.
