import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';

const TOKEN = 'test-token';
let server;
let base;
let store;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grove-test-'));

before(async () => {
  const db = openDb(':memory:', { log: () => {} });
  store = createStore(db, { cliPath: 'C:/repo/scripts/grove.js' });
  const app = createApp(store, { token: TOKEN });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function api(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

async function feature() {
  return (await api('POST', '/api/features', { name: 'Core', color: '#38E1FF' })).body;
}

test('state seeds a feature and settings', async () => {
  const { body } = await api('GET', '/api/state');
  assert.equal(body.settings.theme, 'dark');
  assert.equal(body.settings.route, 'board');
  assert.ok(body.features.length >= 1);
});

test('feature create validates; unknown skin stored as null', async () => {
  assert.equal((await api('POST', '/api/features', { name: '' })).status, 400);
  const f = (await api('POST', '/api/features', { name: 'X', color: '#fff', skin: 'bogus' })).body;
  assert.equal(f.skin, null);
  const p = (await api('PATCH', `/api/features/${f.id}`, { skin: 'fizz', claude_model: 'opus' })).body;
  assert.equal(p.skin, 'fizz');
  assert.equal(p.name, 'X');
  assert.equal((await api('PATCH', `/api/features/${f.id}`, { skin: null })).body.skin, null);
  assert.equal((await api('PATCH', '/api/features/nope', {})).status, 404);
});

test('task lifecycle timestamps and default est', async () => {
  const f = await feature();
  await api('PATCH', '/api/settings', { default_est: 1.5 });
  const t = (await api('POST', '/api/tasks', { title: 'A', feature: f.id })).body;
  assert.equal(t.est, 1.5);
  assert.equal(t.started_at, null);
  assert.equal((await api('POST', '/api/tasks', { title: 'A' })).status, 400);

  let u = (await api('PATCH', `/api/tasks/${t.id}`, { status: 'progress' })).body;
  assert.ok(u.started_at);
  const started = u.started_at;
  u = (await api('PATCH', `/api/tasks/${t.id}`, { status: 'done' })).body;
  assert.ok(u.completed_at);
  u = (await api('PATCH', `/api/tasks/${t.id}`, { status: 'week' })).body;
  assert.equal(u.completed_at, null);
  assert.equal(u.started_at, started);
  const log = store.activity().filter((e) => e.ref_id === t.id);
  assert.deepEqual(log.map((e) => [e.data.from, e.data.to]), [[null, 'backlog'], ['backlog', 'progress'], ['progress', 'done'], ['done', 'week']]);
});

test('entering Claude resets agent fields but a manual state in the same save sticks', async () => {
  const f = await feature();
  const t = (await api('POST', '/api/tasks', { title: 'B', feature: f.id, status: 'progress' })).body;
  await api('PATCH', `/api/tasks/${t.id}`, { status: 'claude' });
  await api('POST', `/api/tasks/${t.id}/agent`, { state: 'running', note: 'x' });
  await api('PUT', `/api/tasks/${t.id}/report`, { markdown: '# hi\r\n' });
  let u = (await api('PATCH', `/api/tasks/${t.id}`, { status: 'progress' })).body;
  assert.equal(u.agent_state, 'running');
  u = (await api('PATCH', `/api/tasks/${t.id}`, { status: 'claude' })).body;
  assert.equal(u.agent_state, null);
  assert.equal(u.agent_note, '');
  assert.equal(u.agent_report, '# hi');
  await api('PATCH', `/api/tasks/${t.id}`, { status: 'progress' });
  u = (await api('PATCH', `/api/tasks/${t.id}`, { status: 'claude', agent_state: 'review', agent_note: 'look' })).body;
  assert.equal(u.agent_state, 'review');
  assert.ok(u.agent_at);
  assert.equal((await api('PATCH', `/api/tasks/${t.id}`, { agent_state: 'bogus' })).status, 400);
  // A title-only save leaves Claude's state alone.
  await api('POST', `/api/tasks/${t.id}/agent`, { state: 'question', note: 'which?' });
  u = (await api('PATCH', `/api/tasks/${t.id}`, { title: 'B2' })).body;
  assert.equal(u.agent_state, 'question');
});

test('agent writers validate', async () => {
  const f = await feature();
  const t = (await api('POST', '/api/tasks', { title: 'C', feature: f.id, subtasks: [{ t: 'one', done: false }, { t: 'two', done: false }] })).body;
  assert.equal((await api('POST', `/api/tasks/${t.id}/agent`, { state: null })).status, 400);
  const s = (await api('POST', `/api/tasks/${t.id}/agent`, { state: 'running', note: 'y'.repeat(400) })).body;
  assert.equal(s.agent_note.length, 280);
  assert.equal((await api('POST', `/api/tasks/${t.id}/subtask`, { n: 0 })).body.error, 'n must be a whole number from 1');
  assert.equal((await api('POST', `/api/tasks/${t.id}/subtask`, { n: 3 })).body.error, 'n must be 1 to 2; this task has 2 subtask(s)');
  assert.equal((await api('POST', `/api/tasks/${t.id}/subtask`, { n: 1, done: 'yes' })).body.error, 'done must be true or false');
  const sub = (await api('POST', `/api/tasks/${t.id}/subtask`, { n: 2 })).body;
  assert.deepEqual(sub.subtask, { n: 2, t: 'two', done: true });
  const t2 = (await api('POST', '/api/tasks', { title: 'D', feature: f.id })).body;
  assert.equal((await api('POST', `/api/tasks/${t2.id}/subtask`, { n: 1 })).body.error, 'this task has no subtasks');
  assert.equal((await api('PUT', `/api/tasks/${t.id}/report`, { markdown: 'x'.repeat(50001) })).status, 400);
  assert.equal((await api('PUT', `/api/tasks/${t.id}/report`, { markdown: '' })).body.agent_report, '');
});

test('agent view and agent status', async () => {
  const f = await feature();
  await api('PATCH', `/api/features/${f.id}`, { claude_model: 'opus', claude_effort: 'high' });
  const t = (await api('POST', '/api/tasks', { title: 'Write the docs', feature: f.id, status: 'claude', desc_html: '<p>hello</p>' })).body;
  const v = (await api('GET', `/api/tasks/${t.id}`)).body;
  assert.equal(v.desc_html, undefined);
  assert.equal(v.desc, 'hello');
  assert.equal(v.session_title, 'Core: Write docs');
  assert.equal(v.setup_label, 'Opus · high effort');
  assert.ok(Array.isArray(v.how_to_report));
  const st = (await api('GET', '/api/agent-status')).body;
  assert.equal(st.cli, 'C:/repo/scripts/grove.js');
  assert.ok(st.tasks.some((x) => x.id === t.id));
});

test('linking files is gated and serves a sandboxed copy', async () => {
  const f = await feature();
  const t = (await api('POST', '/api/tasks', { title: 'E', feature: f.id })).body;
  const file = path.join(tmp, 'page.html');
  fs.writeFileSync(file, '<h1>hi</h1>');
  assert.equal((await api('POST', `/api/tasks/${t.id}/files`, { path: file })).status, 401);
  const auth = { Authorization: `Bearer ${TOKEN}` };
  assert.equal((await api('POST', `/api/tasks/${t.id}/files`, { path: file }, { ...auth, Origin: 'https://evil.example' })).status, 403);
  assert.equal((await api('POST', `/api/tasks/${t.id}/files`, { path: 'rel.html' }, auth)).status, 400);
  const linked = (await api('POST', `/api/tasks/${t.id}/files`, { path: file }, auth)).body;
  assert.equal(linked.title, 'page.html');
  assert.equal(linked.markdown, `[page.html](/api/task-files/${linked.id})`);
  fs.rmSync(file);
  const served = await api('GET', `/api/task-files/${linked.id}`);
  assert.equal(served.status, 200);
  assert.equal(served.body, '<h1>hi</h1>');
  assert.match(served.headers.get('content-security-policy'), /^sandbox allow-scripts/);
  assert.ok(!served.headers.get('content-security-policy').includes('allow-same-origin'));
  const state = (await api('GET', '/api/state')).body;
  const st = state.tasks.find((x) => x.id === t.id);
  assert.deepEqual(Object.keys(st.files[0]).sort(), ['id', 'kind', 'path', 'title', 'url']);
  assert.equal((await api('DELETE', `/api/task-files/${linked.id}`)).status, 204);
});

test('templates', async () => {
  const f = await feature();
  assert.equal((await api('POST', '/api/task-templates', { name: 'x', fields: { feature: 'nope' } })).status, 400);
  const tt = (await api('POST', '/api/task-templates', { name: 'Bug fix', fields: { feature: f.id, priority: 1 } })).status;
  assert.equal(tt, 201);
  const list = (await api('GET', '/api/task-templates')).body;
  const id = list.find((x) => x.name === 'Bug fix').id;
  const p = (await api('PATCH', `/api/task-templates/${id}`, { fields: { est: 2 } })).body;
  assert.deepEqual(p.fields, { est: 2 });
  assert.ok((await api('POST', `/api/task-templates/${id}/used`)).body.last_used_at);
  assert.equal((await api('DELETE', `/api/task-templates/${id}`)).status, 204);
});

test('deleting a feature cascades to its tasks', async () => {
  const f = await feature();
  const t = (await api('POST', '/api/tasks', { title: 'F', feature: f.id })).body;
  assert.equal((await api('DELETE', `/api/features/${f.id}`)).status, 204);
  assert.equal((await api('GET', `/api/tasks/${t.id}`)).status, 404);
});

test('legacy import maps projects and tasks without logging activity', () => {
  const legacy = path.join(tmp, 'kanban.db');
  const old = openLegacy(legacy);
  old.close();
  const db = openDb(path.join(tmp, 'grove.db'), { legacyPath: legacy, log: () => {} });
  const s = createStore(db);
  const state = s.getState();
  assert.deepEqual(state.features.map((f) => f.name), ['Site', 'Old']);
  assert.equal(state.features[1].completed, true);
  const t = state.tasks.find((x) => x.title === 'Ready one');
  assert.equal(t.status, 'week');
  assert.equal(t.desc, 'notes here');
  assert.deepEqual(t.subtasks, [{ t: 'sub', done: true }]);
  assert.equal(state.tasks.find((x) => x.title === 'Done one').completed_at, '2026-01-02T10:00:00Z');
  assert.equal(s.activity().length, 0);
  db.close();
});

function openLegacy(file) {
  const d = new DatabaseSync(file);
  d.exec(`CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, color TEXT, billable INTEGER, completed INTEGER, created_at TEXT);
    CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, priority INTEGER, notes TEXT, status TEXT, done_at TEXT,
      manual_adjustment_minutes INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE subtasks (id INTEGER PRIMARY KEY, task_id INTEGER, label TEXT, checked INTEGER);
    INSERT INTO projects VALUES (1, 'Site', '#22c55e', 0, 0, '2026-01-01 00:00:00'), (2, 'Old', '#f00', 1, 1, '2026-01-01 00:00:00');
    INSERT INTO tasks VALUES (1, 1, 'Ready one', 2, 'notes here', 'ready', NULL, 0, '2026-01-01 09:00:00', '2026-01-01 09:00:00'),
                             (2, 2, 'Done one', 1, NULL, 'done', '2026-01-02 10:00:00', 0, '2026-01-01 09:00:00', '2026-01-02 10:00:00');
    INSERT INTO subtasks VALUES (1, 1, 'sub', 1);`);
  return d;
}
