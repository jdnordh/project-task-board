import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { localDate } from '../src/lib/dates.js';
import { startApi } from './helpers.js';

let t;
before(async () => { t = await startApi(); });
after(() => t.close());

const HTML = '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>Ship it</p></div></li></ul>';

test('create, read, patch a note; body_text is derived on the server', async () => {
  const f = await t.feature('Notes F');
  const c = await t.api('POST', '/api/notes', { body_html: HTML, body_text: 'ignored', feature_id: f.id });
  assert.equal(c.status, 201);
  assert.equal(c.body.title, 'Untitled meeting');
  assert.equal(c.body.meeting_date, localDate());
  assert.equal(c.body.body_text, '[ ] Ship it');
  const p = await t.api('PATCH', `/api/notes/${c.body.id}`, { title: 'Weekly', meeting_date: '2026-10-20', transcript: 'Sam: hi' });
  assert.equal(p.body.title, 'Weekly');
  assert.equal(p.body.body_text, '[ ] Ship it');
  const g = await t.api('GET', `/api/notes/${c.body.id}`);
  assert.equal(g.body.feature_name, 'Notes F');
  assert.deepEqual(g.body.actions, { open: 1, total: 1 });
  assert.equal(g.body.transcript, 'Sam: hi');
  assert.equal((await t.api('GET', '/api/notes/nope')).status, 404);
});

test('validation: real dates, known features, text fields', async () => {
  assert.equal((await t.api('POST', '/api/notes', { meeting_date: '2026-02-30' })).status, 400);
  assert.equal((await t.api('POST', '/api/notes', { feature_id: 'f-nope' })).status, 400);
  assert.equal((await t.api('POST', '/api/notes', { title: 5 })).status, 400);
});

test('list searches and never sends html or transcript; state has no notes', async () => {
  await t.api('POST', '/api/notes', { title: 'Ancient budget', meeting_date: '2020-01-01' });
  const recent = (await t.api('GET', '/api/notes')).body;
  assert.ok(!recent.some((n) => n.title === 'Ancient budget'));
  const found = (await t.api('GET', '/api/notes?q=budget')).body;
  assert.deepEqual(found.map((n) => n.title), ['Ancient budget']);
  assert.ok(!('body_html' in found[0]) && !('transcript' in found[0]));
  assert.ok(!('notes' in (await t.api('GET', '/api/state')).body));
});

test('deleting a feature keeps its notes, unlinked', async () => {
  const f = await t.feature('Doomed');
  const n = (await t.api('POST', '/api/notes', { title: 'Keep me', feature_id: f.id })).body;
  await t.api('DELETE', `/api/features/${f.id}`);
  const g = await t.api('GET', `/api/notes/${n.id}`);
  assert.equal(g.status, 200);
  assert.equal(g.body.feature_id, null);
  assert.deepEqual((await t.api('GET', '/api/notes?feature=none')).body.map((x) => x.id).includes(n.id), true);
  assert.equal((await t.api('DELETE', `/api/notes/${n.id}`)).status, 204);
  assert.equal((await t.api('GET', `/api/notes/${n.id}`)).status, 404);
});
