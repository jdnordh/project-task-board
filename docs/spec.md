> **Grove note:** this is the Cadence rebuild spec Grove was built from (2026-10-28). In Grove, Cadence identifiers are renamed (`cadence-agent` → `grove-agent`, `scripts/cadence.js` → `scripts/grove.js`, `CADENCE_TOKEN` → `GROVE_TOKEN`, `cd-mutation` → `grove-mutation`, `cd-idle` → `g-idle`), the app is dark-only (no theme toggle), and the achievement catalogue/camo thresholds are as in `server/src/lib/achievements.js` and `skins.js`. See `docs/decisions.md` ADR-006..011.

# Cadence — Rebuild Spec (Board, Features, Achievements, Settings)

## 0. What this is

Cadence is a single-user, local-first personal kanban app. One person runs it on their own machine. This spec covers four pages plus the app shell they live in:

- **Board**: a six-column kanban. One column ("Claude") hands a task to a Claude Code session and shows that session's live status.
- **Features**: project/area labels. Every task belongs to one feature.
- **Achievements**: an opt-in gamification layer ("Extras"). Real work earns points; points unlock "camo" skins for features; secret achievements unlock animated skins.
- **Settings**: profile name, board options, page visibility, Extras toggle.

**Out of scope:** meeting notes, design docs, planner, standup, completed view, roadmap, diagrams, backups and the in-app agent. When this spec mentions a link kind or event from those areas, treat it as optional.

---

## 1. Stack and architecture

- **Server:** Node + Express on port **3004**. It persists to SQLite via Node's built-in `node:sqlite` (`DatabaseSync`), with raw SQL and no ORM.
  - Pragmas: `journal_mode = WAL`, `foreign_keys = ON`.
  - Open exactly one connection per process.
- **Client:** a React SPA served by Vite on port **3005**. Vite proxies `/api/*` to 3004.
- **State:** all app state lives in the root `App` component.
  - On mount it calls `GET /api/state` and passes data down as props.
  - Every mutation goes through a handler in `App`. The handler updates local state optimistically, then calls the API.
- **Pure modules:** put every rule in a pure module with no I/O (task templates, agent status, achievements, page visibility, completion fx picking). Unit-test those modules with `node --test`. The client may import pure modules from `server/`.
- **Styling:**
  - CSS custom properties hold the tokens: `--bg-0..3`, `--fg-1..3`, `--border`, `--border-strong`, `--accent`, `--accent-fg`, `--accent-tint`, `--accent-line`, `--danger(-tint)`, `--warning(-tint)`, `--success(-tint)`, `--info(-tint)`, `--radius-xs/md/lg`, `--shadow-md/lg`.
  - Dark and light themes switch via `data-theme` on `<html>`.
  - Component styles are inline.
- **Icons:** Lucide, referenced by name.
- **IDs:** `genId(prefix)` = prefix + `Date.now().toString(36)` + a per-process counter in base 36. Because of this, an id encodes its creation time.
- **Dates:** a due date is a local calendar date `YYYY-MM-DD`. Derive "today" from local date parts, never from `toISOString().slice(0,10)`. Timestamps are ISO strings.

---

## 2. Data model

```sql
CREATE TABLE features (
  id            TEXT PRIMARY KEY,           -- genId('f-')
  name          TEXT NOT NULL,
  color         TEXT NOT NULL,              -- hex; always set, even when skinned
  sort_order    INTEGER NOT NULL,           -- max+1 on create
  completed     INTEGER NOT NULL DEFAULT 0, -- boolean
  skin          TEXT,                       -- skin/camo id or NULL; unknown id stored as NULL
  claude_model  TEXT,                       -- 'opus'|'sonnet'|'fable'|NULL
  claude_effort TEXT                        -- 'low'|'medium'|'high'|'xhigh'|'max'|NULL
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,           -- genId('t')
  title         TEXT NOT NULL,
  feature       TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  priority      INTEGER NOT NULL DEFAULT 3, -- 1..9, 1 = most urgent
  est           REAL NOT NULL DEFAULT 2,    -- hours
  due           TEXT,                       -- YYYY-MM-DD or NULL
  status        TEXT NOT NULL DEFAULT 'backlog', -- backlog|week|progress|claude|blocked|done
  "desc"        TEXT NOT NULL DEFAULT '',   -- plaintext mirror (quoted: reserved word)
  desc_html     TEXT NOT NULL DEFAULT '',   -- rich text HTML
  subtasks      TEXT NOT NULL DEFAULT '[]', -- JSON [{t, done}]
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT,
  started_at    TEXT,                       -- server-managed
  completed_at  TEXT,                       -- server-managed
  agent_state   TEXT,                       -- NULL = waiting | running|question|review|complete
  agent_note    TEXT NOT NULL DEFAULT '',
  agent_at      TEXT,
  agent_report  TEXT NOT NULL DEFAULT '',   -- markdown
  claude_model  TEXT,
  claude_effort TEXT
);

CREATE TABLE task_files (
  id         TEXT PRIMARY KEY,              -- genId('tf')
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'file',  -- 'file' | 'design_doc' (optional)
  path       TEXT NOT NULL,                 -- absolute path, or doc slug
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content    BLOB,                          -- copy of the file's bytes
  stored_at  TEXT,
  UNIQUE (task_id, path)
);

CREATE TABLE task_templates (
  id           TEXT PRIMARY KEY,            -- genId('tt')
  name         TEXT NOT NULL,
  fields       TEXT NOT NULL DEFAULT '{}',  -- partial task as JSON
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); -- all values strings

CREATE TABLE activity_log (                 -- append-only, never update/delete
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,
  kind   TEXT NOT NULL,
  ref_id TEXT,
  data   TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE achievements (                 -- sticky unlocks
  id          TEXT PRIMARY KEY,
  unlocked_at TEXT NOT NULL,
  seen        INTEGER NOT NULL DEFAULT 0
);
```

### Settings seed and keys

- When the `settings` table is empty, seed it with: `theme='dark'`, `route='board'`.
- Keys in scope:

| key | meaning |
|---|---|
| `theme` | `dark` or `light` |
| `route` | first hash segment of the last page shown |
| `user_name` | the user's name (Settings → Profile) |
| `default_est` | estimate a new task starts with |
| `boardShowBlocked` | only the literal `'false'` hides the Blocked column |
| `boardBacklogCollapsed` | `'true'` or `'false'` |
| `lastTaskFeature` | feature a new task starts on |
| `hidden_pages` | JSON array of hidden page ids |
| `extras` | `'true'` or `'false'` |
| `achievement_hints` | JSON `{ last_at, days: { id: 'YYYY-MM-DD' } }` |

---

## 3. Constants

```js
COLUMNS = [
  { id: 'backlog',  label: 'Backlog',     icon: 'inbox' },
  { id: 'week',     label: 'This Week',   icon: 'calendar' },
  { id: 'progress', label: 'In Progress', icon: 'play' },        // label replaced by user_name when set
  { id: 'claude',   label: 'Claude',      icon: 'claude' },      // custom Claude glyph
  { id: 'blocked',  label: 'Blocked',     icon: 'octagon-x' },
  { id: 'done',     label: 'Done',        icon: 'check-check' },
];
IN_PROGRESS = new Set(['progress', 'claude']);
DEFAULT_EST = 0.5; DEFAULT_EST_MAX = 80;
cleanDefaultEst(raw) // Number(raw) if raw not null/'' and finite and 0 < n <= 80, else 0.5
columnLabel(col, userName) // 'progress' with non-blank name → trimmed name, else col.label

FEATURE_PALETTE = [ // 14 swatches {id, hex, name}
  cyan #38E1FF, violet #B68CFF, mint #34E5A0, amber #FFB23E, rose #FF5C72, blue #5B8DEF,
  pink #F472D0, lime #A3E635, orange #FF7A4A, teal #00CFBB, yellow #FFE566, coral #FF7070,
  indigo #7B7FFF, lavender #D4AEFF ];

CLAUDE_MODELS  = [{id:'opus',label:'Opus'},{id:'sonnet',label:'Sonnet'},{id:'fable',label:'Fable'}];
CLAUDE_EFFORTS = ['low','medium','high','xhigh','max'];
AGENT_STATES   = ['running','question','review','complete']; // null = waiting
NOTE_MAX = 280;
```

Card density is baked in as "comfortable": `{ pad:16, gap:12, title:15, titleLines:4, meta:11, colGap:13 }`.

---

## 4. Server rules

### 4.1 Create a task: `createTask(t)`

- `status = t.status ?? 'backlog'`.
- `created_at = now`.
- `started_at = now` if the status is in `IN_PROGRESS`, else null.
- `completed_at = now` if the status is `done`, else null.
- `est = t.est ?? cleanDefaultEst(settings.default_est)`.
- `priority ?? 3`, `due ?? null`, `subtasks ?? []`, `sort_order = MAX+1`.
- `claude_model` and `claude_effort` pass through `cleanModel` / `cleanEffort`. An unknown value becomes null.
- `desc` and `desc_html` come from `deriveDesc` (§4.3).
- Log activity `task_status` with `from: null` (§10.1).

### 4.2 Update a task: `updateTask(id, fields)`

The server whitelists these keys (`TASK_FIELDS`):
`title, feature, priority, est, due, status, desc, desc_html, subtasks, claude_model, claude_effort`.
Agent columns are **not** in this list.

Steps, in order:

1. Copy the present whitelisted keys. Apply `deriveDesc`.
2. `completed_at`:
   - Set it to now when the status enters `done` from another status.
   - Clear it to null whenever the status is not `done`.
3. `started_at`: set it to now when the new status is in `IN_PROGRESS` and `started_at` is still empty. Never clear it.
4. `agentFieldsOnMove(from, to)`: when `to === 'claude' && from !== 'claude'`, reset `agent_state=null, agent_note='', agent_at=null`. Leaving the column, or staying in it, keeps them.
5. Apply the **manual agent patch** (`agentPatch`) *after* step 4. This way, a save that moves the card in and also sets a state keeps that state.
   - `agent_state` must be null or one of `AGENT_STATES`.
   - Clean `agent_note` like a status note (§7.2).
   - Write only when the state or the note actually changed.
   - `agent_at` = now when there is a state, else null.
   - On an invalid value, return 400.
6. If the status changed, log `task_status` activity.

### 4.3 Keep the description and its mirror in sync: `deriveDesc`

`desc` is the plaintext mirror. It is the search haystack and the only description text agents ever see.

| What the write sends | What gets stored |
|---|---|
| neither field | keep the existing values |
| HTML only | `desc = stripHtml(html)` |
| text only | `desc_html = ''` (clear the stale rich text) |
| both | store both as given |

Rules for the mirror and for HTML generation:

- `stripHtml` writes a link as `label (href)`, or just once when the label equals the href.
- Text→HTML (`textToHtml`) lives in one client helper. It escapes `& < > "` and wraps each line in `<p>`.
- The drawer uses `textToHtml` only for the editor's *initial* content when `desc_html` is empty. It never puts that HTML into the draft.

### 4.4 Delete a feature

Deleting a feature cascades to its tasks.

---

## 5. REST API

The body parser is `express.json()`.

### 5.1 Gating

- Everything below is **ungated** unless it is marked 🔒.
- 🔒 routes need `Authorization: Bearer $CADENCE_TOKEN`.
  - They also refuse (403) any `Origin` header that is present and not localhost: `/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/`.
  - They fail closed: with no token configured, every request gets 401.
- The token lives in `.env` as `CADENCE_TOKEN`.

### 5.2 Routes

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/state` | — | `{ features, tasks (each + files[]), settings, templates }` |
| POST | `/api/features` | `{name, color, skin}` | 201 feature; 400 "name and color required" |
| PATCH | `/api/features/:id` | partial; absent key = keep, `null` = clear | feature; 404 |
| DELETE | `/api/features/:id` | — | 204 (tasks cascade) |
| POST | `/api/tasks` | task | 201 task; 400 "title and feature required" |
| PATCH | `/api/tasks/:id` | partial task (+ `agent_state`, `agent_note`) | task (no `files`); 404 |
| DELETE | `/api/tasks/:id` | — | 204 |
| GET | `/api/tasks/:id` | — | agent view (§7.4) |
| GET | `/api/agent-status` | — | `{ cli, tasks: [...] }` (§7.4) |
| POST | `/api/tasks/:id/agent` | `{state, note}` | `{id,title,status,agent_state,agent_note,agent_at}` |
| POST | `/api/tasks/:id/subtask` | `{n, done}` | `{id,title,subtask:{n,t,done},subtasks}` |
| PUT | `/api/tasks/:id/report` | `{markdown}` | `{id, agent_report}` |
| GET | `/api/tasks/:id/files` | — | rows + `url` |
| POST 🔒 | `/api/tasks/:id/files` | `{path, title?}` | 201 `{...row, url, markdown}` |
| DELETE | `/api/task-files/:fid` | — | 204 (origin check only) |
| GET | `/api/task-files/:fid` | — | the stored HTML, sandboxed (§7.5) |
| GET/POST | `/api/task-templates` | `{name, fields}` | list / 201 |
| PATCH | `/api/task-templates/:id` | `{name?, fields?}` (fields = whole set) | template; 404 |
| POST | `/api/task-templates/:id/used` | — | stamps `last_used_at` |
| DELETE | `/api/task-templates/:id` | — | 204 |
| PATCH | `/api/settings` | `{key: value, ...}` (upsert `String(v)`) | full settings map |
| GET | `/api/achievements` | — | §10.6 |
| POST | `/api/achievements/check` | `{action: bool}` | `{new, hint, points, total_points, camos, achievements, queue}` |
| POST | `/api/achievements/seen` | `{ids}` | `{ok:true}` |
| POST | `/api/achievements/hint-seen` | `{id}` | `{ok}` |

### 5.3 The `cd-mutation` event

After every non-GET request, the client dispatches a `cd-mutation` window event. It skips requests under `/api/settings` and `/api/achievements`.

---

## 6. App shell

### 6.1 Sidebar

- Width 224px. Collapsed to icons it is 64px.
- Logo row (60px): a mark and "Cadence".
- Then a "WORKSPACE" label and one `<a href="#/<id>">` per visible page.
- Page order:
  1. Board (`columns-3`)
  2. Features (`layers`)
  3. Achievements (`trophy`, Extras only)
  4. Settings (`settings`, always last, never hideable)
- Active item: `--accent-tint` background, a 2px accent inset bar on the left, an accent icon.
- Count badges:
  - Board: count of non-done tasks.
  - Features: count of active features.
- A plain left click navigates. Modifier clicks and middle clicks fall through to the browser.
- Footer: a "Collapse" button (`chevrons-left`, rotated when collapsed).
- **Narrow mode:** `(max-width: 1100px)`. When the window crosses this breakpoint, the sidebar auto-collapses. A manual toggle made between crossings is kept.

### 6.2 Routing

- The route lives in the hash: `#/<page>/<sub…>`.
- `navigate()` only writes `location.hash`. The `hashchange` listener is the sole caller of `setRoute`, so nothing echoes.
- Persist only the first segment to `settings.route`.
- Boot order:
  1. a visible route from the hash;
  2. otherwise the saved route, if it is visible;
  3. otherwise `firstVisible()`.
- A hidden page redirects to `firstVisible()` with `history.replaceState`.
- The `hashchange` listener reads a ref, not state, for the hidden list, because it is registered once.
- The view is keyed on the route, so it remounts on every route change.

### 6.3 Top bar

- 60px high, sticky, translucent `--bg-1` with `blur(12px)`.
- Search input, placeholder "Search tasks…". It filters the board.
- Primary button:
  - "Add feature" on the Features page. It opens that page's add form.
  - "New task" elsewhere. It opens a new task in This Week.
- Theme toggle: `sun` icon in dark mode, `moon` in light. It saves `settings.theme`.
- Avatar: initials from `user_name`.

---

## 7. Board page

### 7.1 Layout

**Header**

- Title "Board".
- Subtitle: `"{visible} of {total} tasks[ · filtered] · drag cards between columns"`.
- Actions on the right:
  - When Blocked is hidden and has cards: a danger ghost button "{n} blocked". Clicking it turns the column back on.
  - A "Templates" ghost button (`layout-template`). It opens the templates modal.

**Feature filter** (below the header)

- A button reads "Add filter", or "Edit filter" once a filter is applied.
- It opens a 260px popover with:
  - a search box;
  - checkbox rows (dot, name, count of board tasks);
  - completed features hidden, unless one is already selected;
  - a footer with Clear, Cancel and Apply.
- The popover edits a draft. Only Apply commits it.
- Each applied feature becomes a chip with ×. "Clear all" shows when more than one is applied.
- An empty filter means all features.
- The filter is local state. It is not persisted.
- Escape in the popover must `stopPropagation`.

**Columns**

- One CSS grid, one shared vertical scroll, no horizontal scroll.
- Each column is `minmax(0, 1fr)`.
- Gap 14px, or 8px in compact mode.
- Hide Blocked when `boardShowBlocked === 'false'`.
- **Compact mode:** a `ResizeObserver` on the grid. When `width / openColumns < 170`:
  - smaller card padding and title font;
  - column headers drop their icon and hour total;
  - the "Copy" text on the waiting badge is hidden.
- **Backlog collapse:**
  - The backlog header has a `chevrons-left` button titled "Hide Backlog".
  - Collapsed, the backlog becomes a 40px rail button: rotated chevron, icon, count pill, and the label in `writing-mode: vertical-rl`.
  - The rail is still a drop target. Clicking it expands the column.
  - The state is saved as `boardBacklogCollapsed`.

**Column header** (sticky)

- Icon, `columnLabel`, a count pill, and the total estimate via `fmtHours`. The total shows when > 0 and not compact.
- Accent colour by column:
  - `blocked`: `--danger`
  - `done`: `--success`
  - `progress` and `claude`: `--accent-fg`
  - all others: `--fg-3`

**Column body**

- When empty: a dashed box reading "No tasks", or "Drop here" while a card is dragged over it.
- Footer: an "+ Add task" button. It opens a new task with that column's status.

### 7.2 Card

From top to bottom:

1. A 7px feature dot and the feature name (11px, ellipsis). A `PriorityBadge` on the right.
2. The title, clamped to `titleLines`.
3. A meta row:
   - `timer` icon + `fmtHours(est)`;
   - `calendar` icon + `fmtDue(due)`, coloured by `dueTone`. On a done card it reads "Complete";
   - a spacer, then the subtask meter (`list-checks` + `done/n`, green when all are done).
4. In the Claude column only: the **agent badge** (§8.3).
5. In any column: **file links** (§8.3).
6. In the Done column only: a delta stat. It reads "+{dur} saved" in green, "−{dur} over" in red, or "on est." under 1 minute off. The actual time is started_at → completed_at.

Card styling:

- A 4px feature stripe on the left edge.
- Background: a gradient of the feature colour at 9% → 4% over `--bg-1`.
- Hover: `--border-strong` and `--shadow-md`.
- A card being dragged has opacity 0.4.

### 7.3 Drag and drop

- Use **native HTML5** drag and drop. No library.
- Card: `draggable`. `dragstart` sets `effectAllowed='move'`.
- Column: `dragover` calls `preventDefault` and highlights the column (`--accent-tint` background, dashed `--accent-line` outline). `drop` calls `onMove(id, colId)`.
- There is no reorder within a column. Order comes from the sort only.
- `moveTask(id, status)` in App:
  1. When entering `claude`, **copy the prompt synchronously, before any `await`** (§8.2).
  2. Optimistic update. When entering `claude`, also clear the agent fields locally.
  3. `PATCH {status}`. Merge the reply, but keep the task's `files` (the PATCH reply has none).

### 7.4 Sorting and filtering

**Sort within a column**

- Default: priority ascending, then days-until-due ascending. No due date counts as 999.
- Claude column: first by agent rank `{question:0, review:1, complete:2, running:3, waiting:4}`, then the default sort.
- Done column: `completed_at` descending.

**Filters**

- Done shows only cards completed within the last workday window: 72h on a Monday, 24h otherwise.
- Search is a case-insensitive substring match on `title` or `desc`.
- Then the feature filter applies.

### 7.5 New task

- `openNew(status)` opens the drawer with this draft:
  ```js
  { _new:true, title:'', feature: defaultFeature(), priority:2, est: cleanDefaultEst(settings.default_est),
    due:null, status, desc:'', desc_html:'', subtasks:[] }
  ```
- `defaultFeature()` is `lastTaskFeature` if it is still active, otherwise the first active feature.
- Save `lastTaskFeature` when a task is created, or when a task's feature changes.
- Hide "New task" when no task page is visible.

---

## 8. Task drawer

### 8.1 Shell

- A modal on the right.
- Overlay: `rgba(0,0,0,.6)`, `blur(2px)`, z-index 60, 12px inset.
- Panel: 540px wide, rounded, `--shadow-lg`.
- Clicking the overlay is the same as Cancel.
- Header: "NEW TASK" or "EDIT TASK" (mono 11px uppercase) and an × button.
  - A plain feature tints the header with its colour, 22% → 8%.
  - A skinned feature (§10.8) fills the whole drawer with the skin. The body and footer then sit on one glass panel.
- The body scrolls, with padding 20px and gap 20px.

### 8.2 Fields, in order

1. **Claude band.** Shown only while `draft.status === 'claude'`.
   - Header: "Claude · {state label}" with the state icon.
   - The age, shown only while the dropdown still equals the saved state.
   - A "Claude status" `<select>` with options: Waiting to start (`''`→null), Running, Pending question, Design review, Complete.
   - A "Status note" textarea, `maxLength 280`, 2 rows.
2. **Title.** Autofocused, placeholder "What needs doing?".
3. **Template picker.** New tasks only (§9.3).
4. **Parent feature.** A single-select picker with search. It hides completed features unless the task already uses one.
5. **Status.** Six segmented buttons from `COLUMNS` (icon + `columnLabel`). The active one has an `--accent` background.
6. Two columns:
   - **Priority rank:** a stepper 1–9, hint "Lower = more important".
   - **Time estimate:** a stepper 0–80, suffix "h". Steps are 0.25 up to 0.5, then 0.5 (`estStep`).
7. **Due date.**
   - A `type=date` input with inline quick picks "Today" and "EOW" (the coming Friday; on a weekend, next Friday).
   - Only one pick lights up: the one clicked, else the first whose date matches.
   - A "Clear" button shows when a date is set.
8. **Notes.** A rich text editor (TipTap StarterKit: headings, bold, italic, lists, code, links).
   - **No checkbox task-list.** Subtasks are the checklist.
   - On change, set both `desc_html` and `desc` (the editor's plain text).
   - Ctrl/Cmd+K opens a link popover.
   - Links are not inclusive: text typed right after a link does not join it.
   - Remount the editor when a template is applied.
9. **Subtasks.**
   - Header "Subtasks" and "{done}/{n} done", green when all are done.
   - A 4px progress bar.
   - Rows: an 18px check button, the text (struck through when done), and an × to remove.
   - An "Add a subtask…" input. Enter or the "Add" button appends `{t, done:false}`.
   - There is no reorder and no inline edit.
10. **Claude model & effort.** Two selects. Hint: "Shown when you drop the card in the Claude column".
    - The empty option reads "Feature: Opus" when the feature sets a value, else "No model set" / "No effort set".
11. **Claude report.** Existing tasks only, and only when there is a report or linked files (§8.3).

### 8.3 Footer and behaviour

**Footer**

- Delete (danger ghost; existing tasks only).
- "Save as template".
- A spacer.
- Cancel.
- The primary button: "Create task" or "Save changes".

**Dirty check**

- The draft is a deep copy of the task.
- It is dirty when the JSON of these fields differs (nullish values normalised to null):
  `title, feature, priority, est, due, status, desc, desc_html, subtasks, agent_state, agent_note, claude_model, claude_effort`.
- Closing while dirty asks "Discard changes?", with the body "You have unsaved edits to this task. Closing now will lose them." and the button "Discard changes".
- **There is no autosave.**

**Keys** (a window listener, off while the templates modal is open)

- Ctrl+S (Cmd+S on Mac, never with Alt or Shift): `preventDefault` and save. Ignore key repeat and ignore it while a confirm is open.
- Escape: closes an open confirm, otherwise attempts to close the drawer.

**Delete**

- Confirm `Delete “{title}”?` with the body "The task and its subtasks are deleted. This can't be undone." and the button "Delete task".

**Save** (do nothing if the title is blank). For an existing task:

- Send `agent_state` / `agent_note` **only when the user changed them**. A Claude session may report while the drawer is open, and a plain save must not undo that.
- Send `subtasks` only when they changed. Otherwise a save would untick what Claude ticked meanwhile.

---

## 9. Task templates

### 9.1 Stored shape

`fields` is a partial task.

- Allowed keys: `title, feature, status, priority, est, due, desc_html, subtasks, claude_model, claude_effort`.
- **An absent key means "unset"** and leaves the task's own value alone. Never store null.
- `due` is relative: `{kind:'today'} | {kind:'eow'} | {kind:'days', n:0..365}`.

### 9.2 Pure rules

**`validateTemplate(body, {partial})`**

- Only `name` and `fields` are allowed.
- `name` is trimmed, non-empty and at most 80 characters.
- `fields`:
  - Unknown keys are refused. `desc` is accepted and converted to HTML.
  - `title`: at most 200 characters.
  - `status`: must be a column id.
  - `priority`: an integer 1–9.
  - `est`: 0–80.
  - `claude_*`: must be valid values.
  - `desc_html`: kept only if it has text.
  - `subtasks`: strings or `{t}`, trimmed, empties dropped, stored as `done:false`. Omit the key if none remain.
- The route also refuses a `feature` that does not exist.

**`resolveDue(due, now)`** uses local dates:

- `today` → today.
- `eow` → this Friday (on a weekend, the coming Friday).
- `days` → today + n.

**`applyTemplate(draft, fields, {featureIds})`**

- Scalars **replace** the draft's value when the key is present: title, status, priority, est, claude_model, claude_effort, and due (resolved).
- `feature` replaces only when it still exists.
- Notes **add**: the template HTML goes under the draft's own notes. Re-derive `desc`.
- Subtasks **add**: they go after the draft's own, skipping any the draft already has (case-insensitive), all undone. So applying the same template twice adds nothing.

**`fieldsFromTask(task)`** (used by "Save as template")

- Copies everything **except** `due`.
- Skips a `done` status.
- Skips empty notes and empty subtasks.
- Copies only the task's *own* Claude override, never the value inherited from the feature.

**`recentTemplates(list, 3)`**

- Used templates first, by `last_used_at` descending.
- Then unused templates, by name.

**`templateSummary`**

- Joins with " · ": feature name, `P2`, `1h`, `Due end of week`, `3 subtasks`, `Opus · high effort`.

### 9.3 Template picker

Shown under the title of a **new** task only.

- With no templates: a dashed chip "Make a template". It opens the modal.
- Otherwise, in order:
  - up to 3 recent chips (click to apply);
  - a "More ▾" chip. It opens a 280px popover:
    - a search box (AND across terms over name + title);
    - a list sorted by name; arrow keys move the highlight and Enter applies;
    - "No match" when nothing matches;
    - a "Manage templates" footer.
- Applying a template:
  - runs `applyTemplate`;
  - remounts the notes editor;
  - stamps `last_used_at` locally and sends `POST …/used`.

### 9.4 Templates modal

- z-index 70, above the drawer. 920px wide, height `min(760px, 100%)`.
- Opened from three places:
  - the board's "Templates" button;
  - the picker's "Manage templates";
  - "Save as template", which prefills `{name: title, fields: fieldsFromTask(draft)}` as an unsaved form.

**Left list**

- "+ New template".
- A search box.
- Rows with the name and the summary.

**Editor**

- "Template name" field, placeholder "For example: Bug fix".
- Then one **part** per field. Each part has a switch:
  - Off: dimmed, inert, and reads "Not set · leaves the task's own". Clicking it turns the part on.
  - Defaults when turned on: status `backlog`, priority 2, est 1, due `eow` (with n=7 for days), model `sonnet`, effort `high`.
- The due part is a select (Today / End of week (Friday) / In a number of days) plus a day stepper.
- Hints:
  - Due: "Worked out on the day you use the template."
  - Notes: "Added under any notes the task already has."
  - Subtasks: "Added after the task's own. A subtask it already has is not added twice."
  - Claude model and effort: "Used instead of the feature's."
- Only parts that are on are sent.

**Footer**

- Delete (saved templates only).
- An error line.
- "Saved" when there are no changes.
- Close.
- The primary button: "Create template" or "Save template".
- An empty name shows "Give the template a name." and focuses the field.

**Dirty and keys**

- Switching templates, or closing, while dirty asks "Discard changes?".
- While open, the modal owns Ctrl/Cmd+S (save the template) and Escape. The drawer's key listener is off.

**Delete**

- Confirm: "The template is deleted. Tasks made from it stay as they are."

Templates ride in `GET /api/state`.

---

## 10. The Claude column (full loop)

### 10.1 The idea

1. The user drags a card into **Claude**.
2. The app copies a short prompt to the clipboard.
3. The user pastes it into a new Claude Code session, which may run in any folder.
4. That session reads the task through the **`cadence-agent` MCP server** (or a CLI fallback).
5. The session reports its status, ticks subtasks, writes a markdown report and links HTML files it made.
6. The board polls and shows all of it on the card.
7. "Complete" never moves the card. The user reviews it and drags it to Done.

### 10.2 The prompt (pure)

```js
FILLER = ['a','an','the','to','for','of','with','and','in','on','at','by','from','into','so','that'];
shortTaskName(title):
  replace /[^\p{L}\p{N}'\-\s]/gu with ' ', split on whitespace,
  drop FILLER words (case-insensitive) unless that drops all,
  take the first 4 words, join with ' '.
sessionTitle(task, featureName) = featureName ? `${featureName}: ${short}` : short   // short || task.id

claudePrompt(task, cliPath, featureName) = [
  `Please work on my Cadence task ${task.id}: "${task.title}".`,
  `Name this session "${sessionTitle(task, featureName)}".`,
  `Use the cadence-agent MCP tools. Start with get_task.`,
  `No such tools? Run: node "${cliPath with \ → /}" task ${task.id}`,
].join('\n');
```

**The working rules are not in the prompt.** `agentRules()` (§10.6) is their only copy. It is sent in three places:

- as the MCP server's `instructions`;
- at the end of `get_task` output;
- as `how_to_report` in `GET /api/tasks/:id`.

**Model and effort hint**

- `claudeSetup(task, feature)` resolves model and effort **separately**: the task's value first, then the feature's, else null.
- `setupLabel` gives text like "Opus · high effort", "Sonnet" or "max effort".
- A session cannot change its own model, so the app only *tells* the user which to pick.

### 10.3 Client side

**`copyClaudePrompt(task)`**

- Builds the prompt text. The CLI path comes from the last `/api/agent-status` reply.
- Calls `copyText`:
  1. Try `navigator.clipboard.writeText`.
  2. On failure, fall back to a hidden read-only textarea + `document.execCommand('copy')`.
  3. Return a boolean.
- It runs **before the first await** in `moveTask`. A drop has only the user activation left from the drag's mousedown.

**Prompt notice** (fixed bottom-right, 360px wide)

- Title: "Prompt copied", or "Copy the prompt for Claude" when the copy failed.
- Body:
  - copied: "Paste it into a new Claude Code chat. The card shows its status here."
  - failed: "The browser blocked the copy. Click Copy, then paste it into a new Claude Code chat."
- When a setup hint exists: "Pick **Opus · high effort** before you paste."
- The task title.
- When the copy failed: a read-only textarea with the prompt and a **Copy** button (a real click, which always works).
- It auto-closes 6s after a successful copy, unless hovered.

**Agent badge on the card** (Claude column only)

| state | label | icon | colour / tint |
|---|---|---|---|
| null | Waiting to start | clock | `--fg-3` / `--bg-2` |
| running | Running | play (pulsing) | `--info` |
| question | Pending question | circle-help | `--warning` |
| review | Design review | eye | `--accent-fg` |
| complete | Complete | circle-check | `--success` |

- The badge shows the label and the age. Age format: "just now", "Nm ago", "Nh ago", "Nd ago" (rounded).
- **Never show the note on the card.** It made cards tall. The note goes in the badge's hover title and in the drawer.
- While waiting, the badge is a **button** reading "Waiting". On hover it shows a copy icon and "Copy". Its click calls `stopPropagation` and copies the prompt again.
- When `agent_report` is non-empty, add `file-text` + "Report ready".

**File links on the card** (any column)

- One `<a>` per linked file: `draggable=false`, `stopPropagation` on click, a `file-text` icon.
- They open in a new tab, at `/api/task-files/<id>`.

**Polling**

- `GET /api/agent-status` runs once on load, every **10s** while any card is in Claude, and on window focus.
- Merge **only** `agent_state, agent_note, agent_at, agent_report, files, subtasks`. Never touch status or text, which the board edits optimistically.
- Skip the state update when nothing changed.

**Drawer pieces**

- The Claude band (§8.2): a manual status for runs that have no tool access.
- The "Claude report": the markdown rendered read-only, then the list of linked files.
  - Each linked file has an × with the title "Remove link (the file stays on disk)". It deletes at once, not as a draft change.

### 10.4 Server side

**Status and report writers**

| Writer | Body | Rules |
|---|---|---|
| `POST /api/tasks/:id/agent` | `{state, note}` | `state` must be in `AGENT_STATES`. The note collapses whitespace and is trimmed; over 280 characters it becomes `slice(0,279).trimEnd()+'…'` (truncated, not refused). Always stamps `agent_at = now`. |
| `POST /api/tasks/:id/subtask` | `{n, done=true}` | n counts from 1. Errors: `n must be a whole number from 1` / `this task has no subtasks` / `n must be 1 to N; this task has N subtask(s)` / `done must be true or false`. Writes only the `subtasks` column. |
| `PUT /api/tasks/:id/report` | `{markdown}` | At most 50,000 characters. CRLF→LF, trimmed. `''` clears it. Each call replaces the last. |

**`GET /api/tasks/:id`** (agent view)

- Every task field **except `desc_html`**.
- Plus: `feature_name`, `files`, `session_title`, `claude_setup`, `setup_label`, `claude_prompt`, and `how_to_report` (the rules with CLI commands, as an array of lines).

**`GET /api/agent-status`**

- Returns `{ cli: <absolute path of scripts/cadence.js, forward slashes>, tasks }`.
- `tasks`: every task with `status='claude' OR agent_state IS NOT NULL`. Each has `{id, title, feature_name, status, agent_state, agent_note, agent_at, agent_report, subtasks, files}`.

### 10.5 Linked HTML files

**Linking: `POST /api/tasks/:id/files` 🔒** with `{path, title?}`

- `path` must be absolute (`/^([a-zA-Z]:[\\/]|\/|\\\\)/`) and end in `.html` or `.htm`.
- `title` defaults to the file name, at most 200 characters.
- The route reads the file and **stores its bytes in `content`**. The cap is 10 MB; over it returns 413.
- Linking the same path again replaces the copy.
- Returns `markdown: "[title](/api/task-files/<id>)"`.

**Serving: `GET /api/task-files/:fid`**

- `req.hostname` must be localhost (a DNS-rebinding guard). Otherwise 403.
- Serve only `kind='file'`. Re-validate the path.
- Serve the stored copy. If there is none, try the disk, store what it finds, else 404 naming the path.
- Headers:
  ```
  Content-Type: text/html; charset=utf-8
  Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads
  X-Content-Type-Options: nosniff
  Cache-Control: no-store
  ```
  There is **no `allow-same-origin`**. Scripts in the file run but cannot call the API as the app.

**Reads**

- Every read except the content route leaves the bytes out.
- `GET /api/state` adds `files: [{id, kind, title, path, url}]` to each task, fetched with one query.

### 10.6 `agentRules()` — the exact text

Generate it with a `t` table:

- **MCP form** (no args):
  - status: `set_task_status <s> "<n>"`
  - report: `set_task_report`
  - file: `link_task_file`
  - subtask: `check_subtask <n> (the number get_task shows; done: false to untick)`
- **CLI form** (`{cli, id, title}`):
  - status: `${cli} task-status ${id} <s> "<n>"`
  - report: `${cli} task-report ${id} @report.md (or - for stdin)`
  - file: `${cli} task-file ${id} <file.html> --title="<name>"`
  - subtask: `${cli} task-subtask ${id} <n> (n counts from 1; add "undone" to untick)`

```
The user watches this task as a card in the Claude column of their Cadence board. Keep the card current:
1. If you can rename your session (a session-title tool, or /rename), name it <"title" | the "Session title" the task shows>, so the user can tell which feature and task it is.
2. After reading the task, set status running: <status running "<what you are doing now>">
3. Update the running note when you move to a new step.
4. Before you stop to ask the user something, set status question: <status question "<the question>">
5. When they answer and you go on, set status running again.
6. If the task has subtasks, tick each one as soon as you finish it: <subtask>. Tick only work you really did.
7. When the work is done, set status complete: <status complete "<one-line summary>">. Do not move the card; the user reviews it and moves it to Done.
8. Keep each note under 280 characters.
9. For anything longer, write a markdown report (headings, bullets, **bold**, [links](https://…)): <report>. Each report replaces the last, so send all of it each time.
10. If you make an HTML page for the user (a mock-up, a chart, a write-up), save it as one self-contained .html file and link it: <file>. That returns a markdown link: put it in your report. Save the file outside any git repo (your scratchpad folder is good). Cadence keeps a copy in its database when you link it, so the file may be deleted after. If you change the file, link it again to update the copy.
The Cadence server must be running. If it cannot be reached, tell the user and carry on with the task.
```

The original also has rules for design-doc review, description images and report screenshots. Those are out of scope here.

### 10.7 `cadence-agent` MCP server

**Setup**

- stdio, using `@modelcontextprotocol/sdk`.
- Name `cadence-agent`.
- `instructions = "For a Cadence task id the user gives you, call get_task first.\n" + agentRules()`.
- Register it at **user scope**, so it works in every repo:
  ```
  claude mcp add --scope user cadence-agent -- node <repo>/server/mcp/agent-server.js
  ```
- It goes through the **REST API**, not SQLite. That keeps one writer and one set of validation.
- On every call it reads `<repo>/.env` for `PORT` (default 3004) and `CADENCE_TOKEN`.
- When the server cannot be reached: `Cadence is not running at localhost:<port>. Ask the user to start it (npm run dev in <repo>).`

**Tools**

| tool | input | calls | reply |
|---|---|---|---|
| `get_task` | `{task_id}` | GET `/api/tasks/:id` | formatted text, below |
| `set_task_status` | `{task_id, state: enum, note?: ≤560}` | POST `/agent` | `Status on "<title>" is now <state> — <note>` |
| `check_subtask` | `{task_id, n ≥1, done?=true}` | POST `/subtask` | `Ticked n. <t> — X of Y left` / `all subtasks done.` |
| `set_task_report` | `{task_id, markdown ≤50000}` | PUT `/report` | `Report saved (N characters).` / `Report cleared.` |
| `link_task_file` | `{task_id, path, title?}` | POST `/files` (bearer) | `Linked. Put this in your report: <markdown>` |

**`get_task` output lines**

1. `<id> — <title>`
2. `Feature: …`
3. `Session title: …`
4. `Status: … · Priority P# (1 is most urgent) · Estimate #h · Due …`
5. `Description: <plain desc>`
6. `Subtasks:` with lines `n. [x] t`
7. `Your status: <state | not reported yet> — <note>`
8. `Linked files:` with lines `- [title](url) <path> (file id tf…)`
9. `Your current report: …`
10. `How to report:` followed by `agentRules({title})`.

### 10.8 CLI fallback: `scripts/cadence.js`

- Reads `.env` for the token and port. It always sends the bearer.
- Prints pretty JSON.
- Exit codes: 0 on 2xx, 1 on any other HTTP status, 3 on usage or connection errors.

| Command | What it does |
|---|---|
| `task <id>` | GET `/api/tasks/:id` |
| `task-status <id> <state> [note...]` | POST `/agent` |
| `task-subtask <id> <n> [done\|undone]` | POST `/subtask` |
| `task-report <id> <@file.md \| - \| text...>` | PUT `/report` (`-` reads stdin) |
| `task-file <id> <path.html> [--title=..]` | POST `/files`; the path is made absolute against the cwd |

---

## 11. Features page

### 11.1 Layout

- Max width 760px.
- Title "Features", subtitle "Every task belongs to a feature. Pick a color and the board uses it as a visual cue."
- A list (gap 14px) of active feature rows, then "+ Add feature", then a "Completed" section.

### 11.2 Feature row

A card with a feature stripe on the left.

**Header**

- A 12px dot.
- The name. Clicking it, or the pencil button, edits it inline. Blur or Enter saves; an empty name reverts.
- "N tasks".
- Icon buttons: `circle-check` "Mark complete", `pencil` "Rename", `trash-2` "Delete".

**Below the header**

- **Progress** (only when the feature has tasks): a 6px bar in the feature colour, and "x/y done".
- **Board color:** a color picker (§12.7).
  - Picking a plain swatch sets `{color: hex, skin: null}`.
  - Picking a skin sets `{color: skin.hex, skin: id}`.
- **Claude model & effort:** two selects ("No model set" / "No effort set").
  - Hint: "Shown when you drop a task in the Claude column. A task can change it."

Every edit is optimistic, then `PATCH`. Always send `skin`, even when it is null.

### 11.3 Add feature

- The form card has an accent border.
- Fields:
  - "Feature name", placeholder "e.g. Search, Onboarding…". Enter creates.
  - The colour preselects the first palette hex no feature uses yet.
  - "Cancel" and "Create feature".
- The top bar's "Add feature" opens the same form and scrolls it into view.

### 11.4 Complete a feature

- Refuse to complete the **last active** feature. Show a modal "Keep at least one active feature" with the body "New tasks need an active parent feature. Reactivate or add another before completing this one."
- Otherwise, play a completion animation (§11.5), then `PATCH {completed:true}`.
- The Completed section is collapsible and closed by default. It reads "COMPLETED (n)".
  - Its rows have opacity 0.7.
  - Each has a "Reactivate" button.

### 11.5 Completion animation

**Picking (pure)**

- `pickFx(extrasOn, last)`:
  - Extras off: `{id:'swipe', ms:560}`.
  - Extras on: a random pick from `confetti 1500, rocket 1500, shatter 1500, blackhole 1400, stamp 1500, fireworks 1600`, never the same as `last`.

**Running it**

- Animate a **copy** of the row in a fixed portal on `<body>`, so the scroll area does not clip it.
- Meanwhile, the real row goes `visibility:hidden` and folds its height to 0 over 220ms.
- Use timers only:
  - at `ms − 240`: start the fold;
  - at `ms`: write the change.
- Under `prefers-reduced-motion`: no animation, write at once.

### 11.6 Delete a feature

- If it is the only feature: a modal "Keep at least one feature" with the body "Every task needs a parent feature. Add another feature before deleting this one."
- Otherwise, confirm `Delete “<name>”?`.
  - Body with tasks: "This will also delete N task(s) filed under it. This can't be undone."
  - Body with none: "This feature has no tasks. This can't be undone."
  - Button: "Delete feature".
- On confirm, remove the feature and its tasks from state.

---

## 12. Extras: achievements, camos and skins

Settings → **Enable Extras** turns this on. It is off by default and stored as `settings.extras`.

With Extras off:

- Every skin renders as its plain colour. Nothing is deleted.
- The Achievements page is hidden.
- No checks run and no toasts show.

### 12.1 Evidence is `activity_log`, not current rows

- Rows get edited after the fact: `completed_at` clears when a task leaves Done, and `est` stays editable. So achievements read an append-only log.
- `logActivity(kind, refId, data)` is called **inside** `createTask` / `updateTask`, whether Extras is on or off.
- In scope, the only kind is `task_status`:
  ```
  data = { task, from, to, est, due, priority, feature, subs_total, subs_done }
  ```
- Never update or delete log rows.

### 12.2 Anti-gaming rules

A task **counts** only when all of these hold:

- it reached `done` after entering In Progress (`progress` or `claude`);
- at least **30 seconds** passed from the first start to done;
- `est > 0`;
- it is the task's **first** completion.

Also:

- `est`, `priority` and `due` come from the **start** event. So changing them at the finish line does nothing.
- Subtask counts come from the done event.
- Estimate-accuracy checks need `est >= 1`.
- Days are local. Weeks start on Monday. "Every weekday" means Monday to Friday.

### 12.3 Catalogue (samples; the builder adds more on the same pattern)

Shape: `{ id, name, desc, points, goal, hidden?: true }`.

**Visible**

| id | name | desc | pts | goal |
|---|---|---|---|---|
| `first-task` | Off the Line | Finish a task that went through In Progress. | 10 | 1 |
| `tasks-50` | Workhorse | Finish 50 tasks that went through In Progress. | 25 | 50 |
| `tasks-500` | Legend | Finish 500 tasks that went through In Progress. | 60 | 500 |
| `promise-keeper` | Promise Keeper | Finish 25 dated tasks on time, with at least 85% of your last 25 dated tasks on time. | 30 | 25 |
| `calibrated` | Calibrated | Finish 10 tasks of 1h or more within 25% of the estimate. | 25 | 10 |

**Secret** (`hidden: true`)

| id | name | desc | pts | goal | clue |
|---|---|---|---|---|---|
| `eat-the-frog` | Eat the Frog | Finish 5 priority-1 tasks within a day of starting them. | 20 | 5 | "The worst job tastes best when you eat it first." |
| `bullseye` | Bullseye | Finish 5 tasks in a row within 15% of the estimate. | 40 | 5 | (write one) |
| `marathon` | Marathon | Finish a task every weekday for 8 weeks in a row. | 60 | 8 | (write one) |

Rules for the catalogue:

- Every secret has a clue in `CLUES[id]`.
- Every secret unlocks one animated skin (§12.7).

### 12.4 Evaluate (pure)

- `evaluate(events)` returns `[{id, progress (capped at goal), goal, met, near}]`.
- For streak goals, `near` is the **current** run, not the best run.
- `newlyMet(results, unlocked)` returns ids that are met and not yet unlocked. Unlocks are **sticky**: only ever insert.

### 12.5 Camos (points track)

Camos unlock by total points (cumulative). There are 12, in this order:

| id | name | unlockAt |
|---|---|---|
| desert | Desert | 10 |
| arctic | Arctic | 40 |
| woodland | Woodland | 110 |
| digital | Digital | 200 |
| urban | Urban | 300 |
| bluetiger | Blue Tiger | 430 |
| redtiger | Red Tiger | 530 |
| fall | Fall | 640 |
| gold | Gold | 760 |
| platinum | Platinum | 900 |
| damascus | Damascus | 1060 |
| obsidian | Obsidian | 1220 |

- `camosCrossed(before, after)` returns the ids with `before < unlockAt <= after`.
- Tune thresholds so the first switch-on unlocks a few camos and leaves most to earn. Visible points alone must not reach the last camo; secrets are needed.
- Each camo is a seamless 256px canvas texture drawn by code once, when Extras first turns on. It is exposed as a CSS property `--cd-tex-camo-<id>`.

### 12.6 Secret hints (one per local day)

- `hintPool`: secrets that are hidden, have a clue, are not met and are not unlocked. Each is `{id, clue, progress: near, goal}`, sorted by how close it is.
- `pickHint(pool, state, now)`:
  - Return null if a hint was already shown today.
  - Otherwise pick the never-shown hint, else the one shown longest ago. Closeness breaks ties.
- Offer a hint only on a check triggered by a write (`action: true`). A focus check does not count.
- Record the hint in `settings.achievement_hints` **only when the client reports it showed** (`/hint-seen`).

### 12.7 Skins

**Animated skins**

- Shape: `{ id, name, hex, secret: <achievement id>, mini: [colours], dur }`.
- `hex` is what gets stored in `features.color`, so colour-only surfaces still work.
- Samples:
  ```js
  { id:'fizz', name:'Cherry Fizz', hex:'#E8173A', secret:'eat-the-frog',
    mini:['#7a0018','#e8173a','#ff8fa3','#e8173a'], dur:2.6 }
  { id:'party', name:'Party Rock', hex:'#FF5A5F', secret:'bullseye',
    mini:['#ff2e88','#ff5a5f','#ff8a3d','#ffb000'], dur:1 }
  { id:'darkmatter', name:'Dark Matter', hex:'#6A2CFF', secret:'marathon',
    mini:['#12145a','#2a3ad8','#7a2cf0','#c070ff','#d8d0f6','#5a22d0'], dur:3.2 }
  ```
- A harder secret should give a richer skin.

**The one gate: `useSkin(id)`**

- It returns null when Extras is off, the id is unknown, or the skin is locked:
  - a camo is locked until `camos.has(id)`;
  - an animated skin is locked until `earned.has(skin.secret)`.
- Every skin render goes through it.
- A component that asks "is this card skinned?" must use `useSkin`, never `feature.skin`.

**Render sizes**

- **Backdrop:** fills a board card or the drawer at full strength. Card content sits on a **glass panel** (`--skin-glass-bg`, `--skin-glass-border`, radius 7, **no backdrop blur**). The panel's negative margin cancels its padding, so text lands where it does on a plain card.
- **Stripe (4px) and dot (7–8px):**
  - Animated skins use the `mini` gradient, because a texture cropped that small reads as grey.
  - Camos use their texture scaled to 64px.

**Performance rules** (these are required)

- Animate only `transform` and `opacity`, on child layers. Never animate `background-position`, which repaints every card every frame.
- Each moving layer is its own `<i>` child, sized one travel distance bigger than the box and translated by a whole number of tiles.
- **A skinned board card must not use a rounded clip** (`overflow:hidden` + `border-radius`, or `clip-path`). That costs an offscreen GPU pass per card per frame.
  - Instead, clip square.
  - Draw the 1px border ring and paint the page colour over the corners with spread box-shadows, on a final frame element.
- No CSS filter animations on cards. Picker swatches may use them.
- Pause every animation under `prefers-reduced-motion`.
- While the tab is hidden or the window is unfocused, add `cd-idle` to `<html>`. Then pause all animations (`animation-play-state: paused`), so they resume where they stopped.

**Color picker** (`skins` mode, used by Features)

- Always: the 14 palette swatches (30×30).
- With Extras on, also:
  - **"CAMO · N pts":** all 12 camos. Locked ones are disabled, greyscale, with a lock icon and the title "<name> — N pts to go".
  - **"ANIMATED · n of N":** only unlocked animated skins. **A locked animated skin is hidden**, because showing it would give the secret away. Hide the whole section when n = 0.

---

## 13. Achievements page and pop-up

### 13.1 Server views

**`GET /api/achievements`** returns:

```
{ points, total_points, camos: [ids],
  achievements: [{ id, hidden, name, desc, clue, points, goal, progress, unlocked_at, seen }],
  queue: [{ id, name, points, hidden, camos: camosCrossed(...) }] }
```

- `queue` holds the unseen unlocks, oldest first.
- **Masking:** a secret that is not unlocked has `name`, `desc`, `goal` and `progress` set to null. The exception is a "close" secret: in the hint pool and either at ≥80% or already given as a hint. A close secret gets `clue`, `goal` and `progress = near`.
- Unlocked achievements report `progress = goal`.

**`POST /api/achievements/check {action}`**

- Inserts newly met unlocks (`INSERT OR IGNORE … seen=0`).
- Adds `hint` when `action` is true.
- Returns the same payload as GET, plus `new` and `hint`.

### 13.2 When checks run (client, Extras on only)

- On enable: draw the textures, then run a check.
- On `cd-mutation`: debounce 1.5s, then check with `action: true`.
- On window focus: debounce 1.5s, then check with `action: false`. This catches writes from Claude or curl.

### 13.3 Page layout

- Max width 1000px.
- Title "Achievements", subtitle "Earned by real work: tasks finished through In Progress, deadlines kept, reviews with written reasons. Points unlock camos for your features."

Sections, in order:

1. **Three stat cards:**
   - points "of {total} pts";
   - earned "of N earned";
   - camos "of 12 camos".
2. **Camo list:**
   - Header "Camo · x of 12". On the right: "N pts to <next>" or "All camos unlocked".
   - A grid `minmax(78px,1fr)` of 44px tiles.
   - Locked tiles: `grayscale(1) brightness(.4)` with a lock icon.
   - Under each tile: the name and "N pts".
   - `data-ach-target="c-<id>"`.
3. **Animated list:**
   - Header "Animated · n of N", with "Secret achievements unlock these".
   - Shows **only earned** skins. Each tile names the achievement that unlocked it.
   - When empty: "None yet. Each secret achievement you find unlocks one."
   - `data-ach-target="s-<id>"`.
4. **"ACHIEVEMENTS":** a grid `minmax(280px,1fr)` of visible cards.
5. **"SECRET · x of N found":** the secret cards.

**Achievement card** (`data-ach-target="a-<id>"`)

- Icon:
  - `trophy`, with an accent fill once unlocked;
  - `lock` for a secret with no clue;
  - `lightbulb` for a secret with a clue.
- Title:
  - the name;
  - "Secret achievement" for a secret with no clue;
  - "Secret achievement · clue" for a secret with a clue.
- "N pts" on the right.
- Body:
  - the description;
  - for a masked secret: "Keep working. This one shows itself when you earn it.";
  - for a clued secret: the clue in italics, in quotes.
- A 4px progress bar with "p / goal". It shows when the card is not done, `goal > 1`, and the card is either visible or clued.
- Done: "Unlocked <d MMM yyyy>", an accent border and a gradient tint.

**Deep link**

- `#/achievements/<target>` scrolls the target into view, centred.
- It adds a flash ring (2px accent outline) and removes it with a 2600ms **timer**.
- Then it calls `replaceState('#/achievements')`, so the same link works twice.

### 13.4 Unlock pop-up

**Queue**

- Each queue entry expands into:
  1. `{type:'ach'}`;
  2. then each skin whose `secret` is that id;
  3. then each camo it crossed.
- After those, the daily hint, if there is one.
- De-duplicate by key: `a-<id>`, `s-<skin>`, `c-<camo>`, `h-<id>-<day>`.

**Look**

- A portal on `<body>`: fixed, bottom 28px, centred, z-index 110.
- The pill is 64px high. It grows from 64px wide to 380px, or `min(480px, 100vw-32px)` for a hint.
- 52px badge:
  - camo: its texture;
  - skin: the skin;
  - hint: a lightbulb;
  - achievement: an accent radial gradient with a trophy.
- Label:
  - "Achievement unlocked";
  - "Secret achievement unlocked";
  - "Camo unlocked";
  - "Animated skin unlocked";
  - "Secret achievement hint".
- Line: the name and "+N pts". For a hint: the clue in quotes and "p / goal".

**Timing** (timers only, never `animationend` or `transitionend`; reduced motion turns those off and the queue would stall)

- pop 320ms, open 420ms, hold 3600ms (+1800ms for a hint), close 420ms, gap 260ms.

**Behaviour**

- Mark each item seen **as it shows**:
  - an `ach` item → `POST /seen`;
  - a hint → `POST /hint-seen`.
  So a reload mid-queue does not replay it.
- "Skip all (n)" shows when more items wait. It marks the rest seen.
- Clicking the pop-up closes it and opens `#/achievements/<key>`. A hint opens `a-<id>`.
- Do not offer the click when the Achievements page is hidden.
- Turning Extras off clears the queue.

---

## 14. Settings page

### 14.1 Layout

- Max width 760px.
- Sections are 34px apart. Each row is a card: an icon, a label and sub-lines on the left, the control on the right.
- Toggles are `role="switch"`, 38×22, accent when on, dimmed when disabled.

### 14.2 Profile

Subtitle: "Who you are. Claude Code reads this through the cadence MCP server."

**"Your name"** (`user` icon)

- Input: 220px wide, max 60 characters, placeholder "e.g. Sam".
- Saves the trimmed value on blur. Enter blurs. Shows "Saved." for 1.5s.
- Sub-line:
  - "Claude uses this name when it talks about you."
  - When empty: "Not set. Claude calls you "the user" until you add it."
- The name also replaces the "In Progress" column label.

### 14.3 Board

Subtitle: "How the board looks and how new tasks start. Hiding a column keeps its tasks."

- **"Show Blocked column"** (`octagon-x` icon).
  - Sub-line: "Off: blocked tasks stay blocked, and the board header shows how many there are."
- **"Default time estimate"** (`clock` icon).
  - A stepper from 0.25 to 80 with `estStep`, suffix "h".
  - Sub-line: "New tasks start with this. A template's own estimate wins."
  - The server's `createTask` also uses it when a write sends no `est`.

### 14.4 Pages

Subtitle: "Choose which pages show in the sidebar. Hidden pages keep all their data. Turn a page back on to see it again."

- One row per hideable page:
  - Board, Features, and Achievements (listed only while Extras is on).
  - Settings never appears.
- Each row: the page icon and label, and a toggle "Show <label>".

**Pure rules**

- Store **hidden** ids, not enabled ones, in `hidden_pages`. A page added later then shows by default.
  - A missing value means nothing is hidden.
  - Unreadable JSON means nothing is hidden.
- `PAGE_NEEDS = { board: ['features'] }`:
  - Turning Board on also turns Features on.
  - Features is locked on while Board is visible.
- The last visible core page is locked on. Achievements never counts as a core page.
- `lockReason` returns:
  - `{kind:'needed', by}` → sub-line "Stays on: needed by Board";
  - `{kind:'last'}` → sub-line "Stays on: at least one page must stay on";
  - null.
- After `turnOn` pulls in a prerequisite, show "Also turned on: Features".
- `effectiveHidden(hidden, extras)` adds `achievements` while Extras is off. Never store that.
- `firstVisible()` is the first visible page, else `settings`.
- Hiding is **display only**. The API and the MCP server never read it.

### 14.5 Extras

Subtitle: "Fun extras, off by default. Turning them off hides them again and keeps everything you earned."

- **"Enable Extras"** (`trophy` icon).
  - Sub-lines: "Animated feature skins, the Achievements page, and camos you unlock with achievement points." and "Off: skinned features show their plain colour. Nothing is lost."

---

## 15. Shared formatting helpers

**`fmtHours(h)`**

- null → "—"
- a whole number → "3h"
- 0.5 → "30m"; 1.5 → "1h 30m"
- 0.25 → "15m"; 1.25 → "1h 15m"
- anything else → one decimal + "h"

**`fmtDue(iso)`** (local days from today)

- 0 → "Today"; 1 → "Tomorrow"; −1 → "Yesterday"
- below −1 → "Nd overdue"
- up to 7 → "in Nd"
- otherwise "Mon D" (en-US short)

**`dueTone`**

- no date → `--fg-3`
- overdue → `--danger`
- within 1 day → `--warning`
- otherwise `--fg-2`

**`PriorityBadge`**

- Text `P{n}` in mono, weight 600.
- Tone by priority:
  - 1: `--danger`
  - 2: `--warning`
  - 3: `--accent-fg`
  - 4 or more: `--fg-2` on `--bg-3`
- Border: the tone colour at 35%.

**`Stepper`**

- − and + buttons. The value is rounded to 2 decimals and clamped to min/max.

**`Field`**

- A `<label>` with a 10px uppercase mono caption and an optional 12px hint.

**Popovers**

- Close on an outside click and on Escape. Escape must **stop propagation**, so closing a popover does not also close the drawer.

---

## 16. Acceptance checklist

**Board and tasks**

- [ ] Dragging a card into Claude puts the 4-line prompt on the clipboard.
- [ ] If the clipboard is denied, the notice shows the prompt and a working Copy button.
- [ ] A card already in Claude, dragged out and back in, has its agent state reset. Its report and links stay.
- [ ] `node scripts/cadence.js task-status <id> running "x"` turns the card blue ("Running · just now") within 10s.
- [ ] The note is visible only on hover and in the drawer.
- [ ] `check_subtask` moves the card's meter. Then saving the drawer without touching subtasks does not untick it.
- [ ] Opening the drawer, letting Claude change status meanwhile, then saving the title only, keeps Claude's status.
- [ ] A linked HTML file opens from the card in a new tab. It is served sandboxed. It still opens after the original file is deleted.
- [ ] `started_at` is set on the first entry to In Progress or Claude. `completed_at` is set on entering Done and cleared on leaving it.
- [ ] A new task with no `est` gets `default_est`.
- [ ] Applying the same template twice adds no duplicate subtasks or notes. A "days" due date resolves to a real local date.
- [ ] "Save as template" never copies the due date, a done status, or an inherited Claude setting.
- [ ] Ctrl+S in the templates modal saves the template, not the task.

**Features**

- [ ] The last active feature cannot be completed. The last feature cannot be deleted.
- [ ] Deleting a feature deletes its tasks, after a confirm that names the count.

**Extras and achievements**

- [ ] With Extras off, a skinned feature shows its plain colour everywhere, and `features.skin` is unchanged.
- [ ] A task moved backlog → done directly does not count. One that spent ≥30s in progress with est > 0 does, once.
- [ ] Locked animated skins never appear in the picker or on the Achievements page.
- [ ] The toast queue plays one item at a time, also under reduced motion. Reloading mid-queue does not replay seen items.

**Settings**

- [ ] Hiding Features is impossible while Board is visible. Turning Board on turns Features on.