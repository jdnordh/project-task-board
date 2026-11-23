import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveRepo } from '../src/lib/agent.js';
import { openDb } from '../src/db.js';
import { startApi } from './helpers.js';

let t;
before(async () => { t = await startApi(); });
after(() => t.close());

test('resolveRepo: task first, then project, else null', () => {
  assert.equal(resolveRepo({ repo_path: 'C:/a' }, { repo_path: 'C:/b' }), 'C:/a');
  assert.equal(resolveRepo({ repo_path: null }, { repo_path: 'C:/b' }), 'C:/b');
  assert.equal(resolveRepo({}, {}), null);
  assert.equal(resolveRepo(null, null), null);
});

test('GET /api/repos lists direct children with .git (dir or file)', async () => {
  const base = path.join(t.tmp, 'repos');
  fs.mkdirSync(path.join(base, 'r2', '.git'), { recursive: true });
  fs.mkdirSync(path.join(base, 'r1'), { recursive: true });
  fs.writeFileSync(path.join(base, 'r1', '.git'), 'gitdir: elsewhere');
  fs.mkdirSync(path.join(base, 'plain', 'deep', '.git'), { recursive: true });
  await t.api('PATCH', '/api/settings', { repos_base: base });
  const r = await t.api('GET', '/api/repos');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.repos.map((x) => x.name), ['r1', 'r2']);
  assert.equal(r.body.repos[0].path, path.join(base, 'r1').replace(/\\/g, '/'));
  assert.equal(r.body.error, undefined);
});

test('GET /api/repos with a missing or unset base is an empty list, not a 500', async () => {
  await t.api('PATCH', '/api/settings', { repos_base: path.join(t.tmp, 'nope') });
  let r = await t.api('GET', '/api/repos');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.repos, []);
  assert.ok(r.body.error);
  await t.api('PATCH', '/api/settings', { repos_base: '' });
  r = await t.api('GET', '/api/repos');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.repos, []);
});

test('repo_path on projects and tasks; resolved into the agent view', async () => {
  const f = await t.project();
  const pf = await t.api('PATCH', `/api/projects/${f.id}`, { repo_path: 'C:/src/app' });
  assert.equal(pf.body.repo_path, 'C:/src/app');
  assert.equal((await t.api('PATCH', `/api/projects/${f.id}`, { repo_path: 'relative' })).status, 400);
  const task = (await t.api('POST', '/api/tasks', { title: 'A', project: f.id })).body;
  assert.equal(task.repo_path, null);
  assert.equal((await t.api('GET', `/api/tasks/${task.id}`)).body.repo_path, 'C:/src/app');
  assert.equal((await t.api('PATCH', `/api/tasks/${task.id}`, { repo_path: 'nope' })).status, 400);
  await t.api('PATCH', `/api/tasks/${task.id}`, { repo_path: 'D:/other' });
  assert.equal((await t.api('GET', `/api/tasks/${task.id}`)).body.repo_path, 'D:/other');
  await t.api('PATCH', `/api/tasks/${task.id}`, { repo_path: null });
  assert.equal((await t.api('GET', `/api/tasks/${task.id}`)).body.repo_path, 'C:/src/app');
});

test('an old database gains the repo_path columns on open', () => {
  const file = path.join(t.tmp, 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE features (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0, skin TEXT, claude_model TEXT, claude_effort TEXT);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, feature TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE, priority INTEGER NOT NULL DEFAULT 3,
    est REAL NOT NULL DEFAULT 2, due TEXT, status TEXT NOT NULL DEFAULT 'backlog', "desc" TEXT NOT NULL DEFAULT '',
    desc_html TEXT NOT NULL DEFAULT '', subtasks TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT, started_at TEXT, completed_at TEXT, agent_state TEXT, agent_note TEXT NOT NULL DEFAULT '',
    agent_at TEXT, agent_report TEXT NOT NULL DEFAULT '', claude_model TEXT, claude_effort TEXT);`);
  old.close();
  const db = openDb(file, { log: () => {} });
  const cols = (tbl) => db.prepare(`PRAGMA table_info(${tbl})`).all().map((c) => c.name);
  assert.ok(cols('projects').includes('repo_path'));
  assert.ok(cols('tasks').includes('repo_path'));
  db.close();
  openDb(file, { log: () => {} }).close();
});

test('a database from before the projects rename keeps its data', () => {
  const file = path.join(t.tmp, 'features.db');
  const old = new DatabaseSync(file);
  old.exec('PRAGMA foreign_keys = ON');
  old.exec(`CREATE TABLE features (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0, skin TEXT, claude_model TEXT, claude_effort TEXT, repo_path TEXT);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, feature TEXT NOT NULL REFERENCES features(id) ON DELETE CASCADE);
    CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, meeting_date TEXT NOT NULL,
      feature_id TEXT REFERENCES features(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE task_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, fields TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_used_at TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, ref_id TEXT, data TEXT NOT NULL DEFAULT '{}');
    INSERT INTO features VALUES ('f-1', 'Site', '#22c55e', 1, 0, NULL, NULL, NULL, NULL);
    INSERT INTO tasks VALUES ('t1', 'Ship it', 'f-1');
    INSERT INTO notes VALUES ('n1', 'Sync', '2026-01-01', 'f-1', 'x', 'x');
    INSERT INTO task_templates VALUES ('tt1', 'Bug', '{"feature":"f-1","priority":2}', 'x', 'x', NULL);
    INSERT INTO settings VALUES ('route', 'features'), ('lastTaskFeature', 'f-1'), ('hidden_pages', '["features","notes"]');
    INSERT INTO activity_log (at, kind, ref_id, data) VALUES ('x', 'task_status', 't1', '{"task":"t1","feature":"f-1"}');`);
  old.close();

  const db = openDb(file, { log: () => {} });
  const one = (sql) => db.prepare(sql).get();
  assert.equal(one("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'features'").n, 0);
  assert.equal(one('SELECT name FROM projects').name, 'Site');
  assert.equal(one('SELECT project FROM tasks').project, 'f-1');
  assert.equal(one('SELECT project_id FROM notes').project_id, 'f-1');
  assert.deepEqual(JSON.parse(one('SELECT fields FROM task_templates').fields), { priority: 2, project: 'f-1' });
  assert.deepEqual(JSON.parse(one('SELECT data FROM activity_log').data), { task: 't1', project: 'f-1' });
  const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  assert.equal(settings.route, 'projects');
  assert.equal(settings.lastTaskProject, 'f-1');
  assert.equal(settings.lastTaskFeature, undefined);
  assert.equal(settings.hidden_pages, '["projects","notes"]');
  // The foreign keys follow the renamed table: deleting the project cascades.
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("DELETE FROM projects WHERE id = 'f-1'").run();
  assert.equal(one('SELECT COUNT(*) AS n FROM tasks').n, 0);
  assert.equal(one('SELECT project_id FROM notes').project_id, null);
  db.close();
  openDb(file, { log: () => {} }).close();
});
