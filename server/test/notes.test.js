import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteText, countActions, excerpt, searchNotes, openActions } from '../src/lib/notes.js';
import { isRealDate, shiftDate } from '../src/lib/dates.js';

// What TipTap's TaskList/TaskItem render.
const item = (text, checked) =>
  `<li data-checked="${checked}" data-type="taskItem"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div><p>${text}</p></div></li>`;
const BODY = `<h2>Plan</h2><p>See <a href="https://x.test">deck</a></p><ul data-type="taskList">${item('Call Sam', false)}${item('Send deck', true)}</ul><p><img src="/api/images/img1"></p>`;

test('noteText writes action items as [ ] / [x], links as label (url), images as [image]', () => {
  assert.equal(noteText(BODY), 'Plan\nSee deck (https://x.test)\n[ ] Call Sam\n[x] Send deck\n[image]');
  assert.equal(noteText(''), '');
});

test('countActions reads data-checked', () => {
  assert.deepEqual(countActions(BODY), { open: 1, total: 2 });
  assert.deepEqual(countActions('<p>none</p>'), { open: 0, total: 0 });
});

test('openActions lists unticked item text', () => {
  assert.deepEqual(openActions(BODY), ['Call Sam']);
});

test('isRealDate and shiftDate', () => {
  assert.ok(isRealDate('2026-02-28'));
  assert.ok(!isRealDate('2026-02-30'));
  assert.ok(!isRealDate('2026-2-3'));
  assert.ok(!isRealDate(null));
  assert.equal(shiftDate('2026-10-28', -14), '2026-10-14');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('excerpt is ~200 chars around the word', () => {
  const text = 'a '.repeat(300) + 'needle ' + 'b '.repeat(300);
  const e = excerpt(text, 'NEEDLE');
  assert.ok(e.includes('needle'));
  assert.ok(e.length <= 202);
  assert.equal(excerpt('short text', 'zzz'), 'short text');
});

const note = (o) => ({
  id: o.id, title: o.title ?? o.id, meeting_date: o.date, feature_id: o.feature ?? null,
  body_html: o.html ?? '', body_text: o.text ?? '', transcript: o.transcript ?? '',
  created_at: '2026-01-01T00:00:00Z', updated_at: o.updated ?? '2026-01-01T00:00:00Z',
});
const NOTES = [
  note({ id: 'old', date: '2024-09-01', text: 'Budget review with Sam' }),
  note({ id: 'edge', date: '2026-10-14', feature: 'f1', html: BODY, text: noteText(BODY) }),
  note({ id: 'out', date: '2026-10-13', text: 'budget' }),
  note({ id: 'new', date: '2026-10-27', updated: '2026-10-27T09:00:00Z', text: 'standup' }),
  note({ id: 'new2', date: '2026-10-27', updated: '2026-10-27T10:00:00Z', text: 'retro', transcript: 'Sam: the pipeline budget is tight' }),
];
const TODAY = '2026-10-28';

test('no search text: last 14 days by meeting_date, newest first', () => {
  const r = searchNotes(NOTES, { today: TODAY });
  assert.deepEqual(r.map((n) => n.id), ['new2', 'new', 'edge']);
});

test('search text: every word, any case, all dates', () => {
  const r = searchNotes(NOTES, { q: 'BUDGET sam', today: TODAY });
  assert.deepEqual(r.map((n) => n.id), ['new2', 'old']);
});

test('excerpt comes from the transcript when the word is only there', () => {
  const [hit] = searchNotes(NOTES, { q: 'pipeline', today: TODAY });
  assert.equal(hit.id, 'new2');
  assert.match(hit.excerpt, /pipeline budget/);
  assert.equal(hit.has_transcript, true);
});

test('from/to and feature filters; feature none', () => {
  assert.deepEqual(searchNotes(NOTES, { from: '2024-01-01', to: '2024-12-31', today: TODAY }).map((n) => n.id), ['old']);
  assert.deepEqual(searchNotes(NOTES, { feature: 'f1', from: '2000-01-01', today: TODAY }).map((n) => n.id), ['edge']);
  assert.ok(!searchNotes(NOTES, { feature: 'none', today: TODAY }).some((n) => n.id === 'edge'));
});

test('list rows carry counts but never html or transcript', () => {
  const [row] = searchNotes(NOTES, { q: 'call', today: TODAY });
  assert.equal(row.id, 'edge');
  assert.deepEqual(row.actions, { open: 1, total: 2 });
  assert.ok(!('body_html' in row));
  assert.ok(!('transcript' in row));
  assert.ok(!('body_text' in row));
});
