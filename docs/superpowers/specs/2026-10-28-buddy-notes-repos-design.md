# Buddy, meeting notes, repo selection and description images — design

Date: 2026-10-28. Source: `buddy-skill-spec.md` (the user's Buddy spec), plus the user's answers in chat.
Marked **(my call)** = decided by the builder, not the user; easy to change.

## 1. Why

Grove already has a Claude column and a `grove-agent` MCP server, so one Claude session can work one card.
The user wants a **foreman**: one Buddy chat, run from this repo, that turns a request into cards, starts a
worker session per card **in the right git repo**, relays questions and pulls results back. Buddy's
opening briefing reads recent **meeting notes**, which Grove does not have yet. Workers must also see
pictures in task descriptions.

## 2. Scope

In:
1. **Repo selection** — base folder in Settings; scan its direct children for git repos; repo on a
   feature, optional override on a task.
2. **Description images** — paste/drop images into a task description; workers can fetch them; workers
   can upload images for their report.
3. **Meeting notes** — data, search module, REST API, Notes page, agent tools.
4. **Buddy** — MCP tools and the `buddy` skill in this repo, with briefing source files.

Out (user's call): design docs (`link_design_doc`, `review` flow for docs, worker rule 11), transcript
file attachments (`.txt/.md/.vtt/.srt/.docx` upload).

Anti-goals: Buddy writes during the briefing; Buddy answers a worker's question for the user; Buddy moves
a card to Done; workers can only run inside this repo.

## 3. Repo selection

- Setting `repos_base` (absolute folder path), edited on the Settings page as a text field (browsers give no
  real folder path from a picker) **(my call)**.
- `GET /api/repos` → `{ base, repos: [{ name, path }], error? }`. Scans **direct children only**; a child
  is a repo if it contains `.git` (folder or file — a worktree has a `.git` file). Sorted by name.
  Missing/unreadable base → empty list plus an error message, never a 500.
- Columns `features.repo_path` and `tasks.repo_path` (nullable TEXT, absolute path). Stored as a full path,
  not a name, so changing the base later does not silently re-point features **(my call)**.
- Resolution (pure, in `lib/agent.js`): `task.repo_path ?? feature.repo_path ?? null`, same shape as
  model/effort.
- UI: Features page edit gets a **Repo** dropdown (None + scanned repos). Task drawer gets **Repo**:
  "Feature default (<name>)" + scanned repos. A stored path not in the scan still shows, marked "not found".
- Existing databases: add the columns with an idempotent `ALTER TABLE … ADD COLUMN` migration in `db.js`.

## 4. Description images

- Table `images (id, mime, bytes BLOB, created_at)`.
- `POST /api/images` — raw body, `Content-Type` png/jpeg/gif/webp, ≤ 5 MB → `{ id, url: "/api/images/<id>" }`.
  `GET /api/images/:id` serves bytes with the stored type and `nosniff`.
- Task description editor (`NotesEditor`) adds the TipTap Image extension; paste or drop of an image file
  uploads it and inserts `<img src="/api/images/<id>">`. Only `/api/images/` sources are kept **(my call)**.
- `stripHtml` turns `<img>` into `[image]`, so the plain `desc` agents read shows where pictures are.
- Report images: the report renderer already uses marked + DOMPurify; `/api/images/…` image links render.
- Worker tools (in `grove-agent`):
  - `get_task_images {task_id, save_to_dir?}` — finds `/api/images/<id>` in `desc_html`, saves each file
    (default dir: OS temp `grove-images/<task_id>`), returns the paths in order.
  - `upload_report_image {task_id, path, caption}` — server reads the local file (gated like
    `link_task_file`), stores it, returns `![caption](/api/images/<id>)`.
- `POST /api/images` uses its own `express.raw({ limit: '5mb' })` (the global JSON limit is 2 MB) and
  checks magic bytes, not only the header. SVG is never accepted.
- `upload_report_image` accepts only absolute paths ending .png/.jpg/.jpeg/.gif/.webp, ≤ 5 MB, magic
  bytes checked — same pattern as `linkFile`'s .html restriction.
- Worker rules gain spec rules 12 and 13. Rule 11 (design docs) is left out.
- CLI fallback (`scripts/grove.js`) gains `task-images <id> [dir]` and `task-image <id> <file>
  [--caption=..]`, so the CLI form of rules 12–13 works too.
- Client dependency: `@tiptap/extension-image`. Image support goes in both the task and note editors.

## 5. Meeting notes

Data — table `notes`: `id, title, meeting_date (YYYY-MM-DD), feature_id REFERENCES features ON DELETE SET
NULL, body_html, body_text, transcript, created_at, updated_at`. (`transcript_name` dropped with the upload
feature; `transcript` kept as a plain paste-in field **(my call)**.)

- `body_text` is **always derived on the server** from `body_html` by one pure function `noteText(html)`;
  the client never sends it. That makes editor and API notes identical by construction **(my call)**.
  Action items → `[ ] text` / `[x] text`; links → `label (url)`; images → `[image]`.
- Not part of `/api/state`.

Pure module `server/src/lib/notes.js` (tested): `noteText`, `countActions(html)` (from
`data-checked="true|false"`), `excerpt(text, word)` (~200 chars), `searchNotes(rows, {q, from, to,
feature, today})` with the spec's rules: AND of words, case-insensitive, over title + body_text +
transcript; **no q → last 14 days by meeting_date; q → all dates**; `feature` = id or `'none'`; sort by
meeting_date desc then updated_at desc; excerpt from transcript if the first word is only there. List rows
never carry HTML or transcript.

REST: `GET /api/notes?q&from&to&feature`, `GET /api/notes/:id`, `POST /api/notes`, `PATCH /api/notes/:id`,
`DELETE /api/notes/:id`.

UI — new sidebar page **Notes** (`#/notes`, `#/notes/<id>`):
- List: date range (defaults today−14 → today), search box, feature filter, "New note". Rows show date,
  title, feature chip, open/total action items, excerpt.
- Detail: title, meeting date (defaults today), feature picker, rich editor (TipTap + task list +
  images; the task list is an opt-in `NotesEditor` prop used only by Notes, so task descriptions keep
  subtasks as their only checklist — TaskList/TaskItem come from the already-installed
  `@tiptap/extension-list`, whose items render `data-checked`), a collapsible "Transcript" textarea. Autosave 1.5 s after typing stops, on blur, on route
  change and on `beforeunload`.
- **Promote to task**: a side list of the note's open action items, each with a Promote button **(my
  call — simpler than a button inside the editor line)**. Creates a backlog task titled with the item,
  feature = the note's feature, else asks with the feature picker; description links back to the note.

Agent tools (both servers): `search_meeting_notes {q?, from?, to?, feature?}` (feature id or name) →
`id · date · title [Feature] (open/total open)` + excerpt; `get_meeting_note {id}` → title, date,
feature, `body_text`, then `--- Transcript ---` and the transcript.

## 6. Buddy

### Tools
- **`grove-agent`** (existing; confirmed registered at user scope in `~/.claude.json`, so it works from any repo) — worker tools, plus `get_task_images`,
  `upload_report_image`, `search_meeting_notes`, `get_meeting_note`.
- **`grove-buddy`** (new, `server/mcp/buddy-server.js`, registered only in this repo's `.mcp.json`):
  `get_profile`, `list_features` (line also shows the feature's repo), `list_tasks {status[], overdue,
  limit}`, `get_task`, `search_meeting_notes`, `get_meeting_note`, `create_task`, `delegate_task`,
  `list_claude_tasks {all?}`, `read_task_file {file_id, save_to?}`. Claude Code asks once to approve a
  project `.mcp.json` server the first time.
- Shared HTTP client extracted to `server/mcp/client.js`. Both servers use REST only.
- `create_task` rules in a pure module `lib/buddy.js` (tested): refuse unknown fields; feature by id or
  case-insensitive name, error lists real names; status only `backlog`/`week`; `due` must be a real
  calendar date; `est` omitted → user default (server already does this); `subtasks` string list.
- `delegate_task` → new `POST /api/tasks/:id/delegate`: moves to `claude` through `updateTask` (same
  reset as a drag), returns `prompt`, `session_title`, `setup_label`, `model`, `effort`, `repo_path`
  (resolved), and whether it already had a report/files.
- `list_claude_tasks`: order question, review, complete, running, waiting; each line has age, report
  yes/no, ticked subtasks `n/m`, file ids.
- Worker prompt = existing `claudePrompt` (4 lines, Grove names). Unchanged.

### Skill
`.claude/skills/buddy/SKILL.md` — the spec's sections 4–7 rewritten for Grove: naming, briefing, main
loop, hard rules. Briefing sources in `.claude/skills/buddy/sources/10-meetings.md`, `20-unfinished.md`,
`30-features.md`, each with Title / Needs / Skip when / Gather / Write. A `node --test` test fails if a
source misses a section.

Folder per task: the resolved `repo_path`; none → Buddy asks the user (user's call).

Starting workers (user's call): **desktop-app sessions**, unless Buddy's own session is under Remote
Control, then **subagents**.
- Detection: `get_session("self")` reports `remoteControlState` ("on"/"connecting" → subagents). If that
  tool is missing or `start_session` is refused/unavailable, also fall back to subagents.
- Session start: `start_session` with `initiation: "user_asked"`, `context: "fresh"`, `cwd` = the task's
  folder, `title` `Buddy: <session title>`, `model`/`effort` from the hint, `use_worktree` true only when
  two workers write the same repo, `wake_when_done: true`, prompt = delegate prompt + the spec's extra
  line. The approval table's **Folder** column is where the user names each place (the app allows `cwd`
  only for a place the user named). The app may ask the user to trust a folder it has not opened before;
  the skill warns about that. The app caps model/effort at Buddy's own, so Buddy should run on the
  strongest setup a worker needs.
- Subagent fallback: spec rules (worktree for another repo, commit, never push; return the question as
  the result).

## 7. Testing
- `npm test`: notes module, buddy validation, repo resolution, `[image]` in stripHtml, source-file
  sections, API tests for notes/images/repos/delegate, MCP formatting.
- `npm run typecheck`.
- Browser check of Notes page, repo dropdowns, image paste, via the preview server.

## 8. Left to the builder
Exact layout/styling (follow Tech Forest tokens and existing pages), icons, error wording, limits not
given above.
