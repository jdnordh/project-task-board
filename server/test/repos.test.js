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

test('resolveRepo: task first, then feature, else null', () => {
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

test('repo_path on features and tasks; resolved into the agent view', async () => {
  const f = await t.feature();
  const pf = await t.api('PATCH', `/api/features/${f.id}`, { repo_path: 'C:/src/app' });
  assert.equal(pf.body.repo_path, 'C:/src/app');
  assert.equal((await t.api('PATCH', `/api/features/${f.id}`, { repo_path: 'relative' })).status, 400);
  const task = (await t.api('POST', '/api/tasks', { title: 'A', feature: f.id })).body;
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
    CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, feature TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 3,
    est REAL NOT NULL DEFAULT 2, due TEXT, status TEXT NOT NULL DEFAULT 'backlog', "desc" TEXT NOT NULL DEFAULT '',
    desc_html TEXT NOT NULL DEFAULT '', subtasks TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT, started_at TEXT, completed_at TEXT, agent_state TEXT, agent_note TEXT NOT NULL DEFAULT '',
    agent_at TEXT, agent_report TEXT NOT NULL DEFAULT '', claude_model TEXT, claude_effort TEXT);`);
  old.close();
  const db = openDb(file, { log: () => {} });
  const cols = (tbl) => db.prepare(`PRAGMA table_info(${tbl})`).all().map((c) => c.name);
  assert.ok(cols('features').includes('repo_path'));
  assert.ok(cols('tasks').includes('repo_path'));
  db.close();
  openDb(file, { log: () => {} }).close();
});
