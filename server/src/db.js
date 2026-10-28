/**
 * db.js — opens the SQLite database (node:sqlite), creates the schema,
 * imports the legacy board once, and seeds settings.
 *
 * One connection per process. The legacy import ATTACHes a backup copy of
 * the old kanban.db on that same connection, so the original files are
 * never touched.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { genId } from './lib/ids.js';
import { FEATURE_PALETTE, DEFAULT_EST } from './lib/constants.js';
import { localDate } from './lib/dates.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS features (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL,
  sort_order    INTEGER NOT NULL,
  completed     INTEGER NOT NULL DEFAULT 0,
  skin          TEXT,
  claude_model  TEXT,
  claude_effort TEXT,
  repo_path     TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  feature       TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  priority      INTEGER NOT NULL DEFAULT 3,
  est           REAL NOT NULL DEFAULT 2,
  due           TEXT,
  status        TEXT NOT NULL DEFAULT 'backlog',
  "desc"        TEXT NOT NULL DEFAULT '',
  desc_html     TEXT NOT NULL DEFAULT '',
  subtasks      TEXT NOT NULL DEFAULT '[]',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT,
  started_at    TEXT,
  completed_at  TEXT,
  agent_state   TEXT,
  agent_note    TEXT NOT NULL DEFAULT '',
  agent_at      TEXT,
  agent_report  TEXT NOT NULL DEFAULT '',
  claude_model  TEXT,
  claude_effort TEXT,
  repo_path     TEXT
);

CREATE TABLE IF NOT EXISTS task_files (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'file',
  path       TEXT NOT NULL,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content    BLOB,
  stored_at  TEXT,
  UNIQUE (task_id, path)
);

CREATE TABLE IF NOT EXISTS task_templates (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  fields       TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  feature_id   TEXT REFERENCES features(id) ON DELETE SET NULL,
  body_html    TEXT NOT NULL DEFAULT '',
  body_text    TEXT NOT NULL DEFAULT '',
  transcript   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  bytes      BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS activity_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,
  kind   TEXT NOT NULL,
  ref_id TEXT,
  data   TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS achievements (
  id          TEXT PRIMARY KEY,
  unlocked_at TEXT NOT NULL,
  seen        INTEGER NOT NULL DEFAULT 0
);
`;

/** Columns added after the first release: [table, column, type]. */
const ADDED_COLUMNS = [
  ['features', 'repo_path', 'TEXT'],
  ['tasks', 'repo_path', 'TEXT'],
];

/** Bring an older database up to the current schema (idempotent). */
function migrate(db) {
  for (const [table, col, type] of ADDED_COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}

/** Legacy `YYYY-MM-DD HH:MM:SS` (UTC, from datetime('now')) → ISO. */
function legacyTs(s) {
  if (!s) return null;
  return s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
}

const LEGACY_STATUS = { backlog: 'backlog', ready: 'week', in_progress: 'progress', blocked: 'blocked', done: 'done' };

/**
 * Import the old projects/tasks board. Copies kanban.db (+ -wal/-shm) into a
 * backup folder first and reads the copy, so the originals stay as they are.
 */
function importLegacy(db, legacyPath, log) {
  const dir = path.join(path.dirname(legacyPath), `kanban-backup-${localDate()}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(legacyPath + ext)) fs.copyFileSync(legacyPath + ext, path.join(dir, path.basename(legacyPath) + ext));
  }
  const copy = path.join(dir, path.basename(legacyPath));
  db.prepare('ATTACH DATABASE ? AS legacy').run(copy);
  try {
    const tables = new Set(db.prepare("SELECT name FROM legacy.sqlite_master WHERE type='table'").all().map((r) => r.name));
    if (!tables.has('projects') || !tables.has('tasks')) return;
    const projects = db.prepare('SELECT * FROM legacy.projects ORDER BY id').all();
    const featureId = new Map();
    const insFeature = db.prepare('INSERT INTO features (id, name, color, sort_order, completed) VALUES (?, ?, ?, ?, ?)');
    projects.forEach((p, i) => {
      const id = genId('f-');
      featureId.set(p.id, id);
      insFeature.run(id, p.name, p.color || FEATURE_PALETTE[i % FEATURE_PALETTE.length].hex, i + 1, p.completed ? 1 : 0);
    });
    const subs = new Map();
    if (tables.has('subtasks')) {
      for (const s of db.prepare('SELECT * FROM legacy.subtasks ORDER BY id').all()) {
        if (!subs.has(s.task_id)) subs.set(s.task_id, []);
        subs.get(s.task_id).push({ t: s.label, done: !!s.checked });
      }
    }
    const insTask = db.prepare(`INSERT INTO tasks
      (id, title, feature, priority, est, status, "desc", desc_html, subtasks, sort_order, created_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?)`);
    const tasks = db.prepare('SELECT * FROM legacy.tasks ORDER BY id').all();
    tasks.forEach((t, i) => {
      const feature = featureId.get(t.project_id);
      if (!feature) return;
      const status = LEGACY_STATUS[t.status] ?? 'backlog';
      const started = status === 'progress' || status === 'done' ? legacyTs(t.updated_at ?? t.created_at) : null;
      insTask.run(
        genId('t'), t.name, feature, Math.min(9, Math.max(1, t.priority ?? 3)), DEFAULT_EST, status,
        t.notes ?? '', JSON.stringify(subs.get(t.id) ?? []), i + 1,
        legacyTs(t.created_at), started, status === 'done' ? legacyTs(t.done_at ?? t.updated_at) : null,
      );
    });
    log(`Imported ${projects.length} projects and ${tasks.length} tasks from ${legacyPath} (backup: ${dir})`);
  } finally {
    db.exec('DETACH DATABASE legacy');
  }
}

export function openDb(dbPath, { legacyPath = null, log = console.log } = {}) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);

  const empty = db.prepare('SELECT COUNT(*) AS n FROM features').get().n === 0;
  const fresh = empty && db.prepare('SELECT COUNT(*) AS n FROM settings').get().n === 0;
  if (fresh && legacyPath && fs.existsSync(legacyPath)) {
    try {
      importLegacy(db, legacyPath, log);
    } catch (err) {
      log(`Legacy import failed, starting fresh: ${err.message}`);
    }
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM features').get().n === 0 && fresh) {
    db.prepare('INSERT INTO features (id, name, color, sort_order) VALUES (?, ?, ?, 1)').run(genId('f-'), 'General', FEATURE_PALETTE[0].hex);
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM settings').get().n === 0) {
    const ins = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    ins.run('theme', 'dark');
    ins.run('route', 'board');
  }
  return db;
}
