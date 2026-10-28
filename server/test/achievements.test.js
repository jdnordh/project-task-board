import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGUE, CLUES, TOTAL_POINTS, completions, evaluate, newlyMet, hintPool, pickHint, buildView, pointsOf,
} from '../src/lib/achievements.js';
import { CAMOS, SKINS } from '../src/lib/skins.js';

let seq = 0;
function ev(task, from, to, at, extra = {}) {
  seq += 1;
  return { id: seq, kind: 'task_status', ref_id: task, at: new Date(at).toISOString(),
    data: { task, from, to, est: 1, due: null, priority: 3, feature: 'f1', subs_total: 0, subs_done: 0, ...extra } };
}
/** A task started at `start` and finished `mins` later. */
function finished(task, start, mins, extra = {}, doneExtra = {}) {
  const s = new Date(start);
  return [ev(task, 'week', 'progress', s, extra), ev(task, 'progress', 'done', new Date(s.getTime() + mins * 60000), { ...extra, ...doneExtra })];
}
const get = (results, id) => results.find((r) => r.id === id);

test('catalogue invariants', () => {
  const visible = CATALOGUE.filter((a) => !a.hidden).reduce((s, a) => s + a.points, 0);
  const last = CAMOS.at(-1).unlockAt;
  assert.ok(visible < last, `visible ${visible} must not reach ${last}`);
  assert.ok(last <= TOTAL_POINTS);
  for (const a of CATALOGUE.filter((x) => x.hidden)) {
    assert.ok(CLUES[a.id], `${a.id} needs a clue`);
    assert.equal(SKINS.filter((s) => s.secret === a.id).length, 1, `${a.id} unlocks exactly one skin`);
  }
  for (const s of SKINS) assert.ok(CATALOGUE.some((a) => a.id === s.secret && a.hidden));
  assert.equal(CAMOS.length, 12);
  assert.equal(new Set(CATALOGUE.map((a) => a.id)).size, CATALOGUE.length);
});

test('anti-gaming: backlog → done does not count; ≥30s in progress with est > 0 does, once', () => {
  const t0 = Date.parse('2026-10-28T10:00:00');
  const events = [
    ev('a', null, 'backlog', t0), ev('a', 'backlog', 'done', t0 + 3600000),
    ...finished('b', t0, 0.25), // 15 seconds
    ...finished('c', t0, 5, { est: 0 }),
    ...finished('d', t0, 5),
    ev('d', 'done', 'progress', t0 + 3600000), ev('d', 'progress', 'done', t0 + 7200000),
  ];
  const done = completions(events);
  assert.deepEqual(done.map((c) => c.task), ['d']);
  const r = evaluate(events, new Date(t0 + 7200000));
  assert.equal(get(r, 'first-task').met, true);
  assert.equal(get(r, 'tasks-10').progress, 1);
});

test('created straight into In Progress counts as the start', () => {
  const t0 = Date.parse('2026-10-28T10:00:00');
  const events = [ev('x', null, 'progress', t0), ev('x', 'progress', 'done', t0 + 60000)];
  assert.equal(completions(events).length, 1);
});

test('estimate, priority and due come from the start event', () => {
  const t0 = Date.parse('2026-10-28T10:00:00');
  const events = [
    ev('p', 'week', 'progress', t0, { priority: 3, est: 2 }),
    ev('p', 'progress', 'done', t0 + 60000, { priority: 1, est: 0.02 }),
  ];
  const [c] = completions(events);
  assert.equal(c.priority, 3);
  assert.equal(c.est, 2);
});

test('calibrated and bullseye need est >= 1; bullseye near is the current run', () => {
  const day = (i) => Date.parse(`2026-10-${String(1 + i).padStart(2, '0')}T09:00:00`);
  const events = [];
  for (let i = 0; i < 6; i++) events.push(...finished(`b${i}`, day(i), 60)); // exactly on estimate
  events.push(...finished('miss', day(7), 200));
  events.push(...finished('hit', day(8), 62));
  const r = evaluate(events, new Date(day(9)));
  assert.equal(get(r, 'bullseye').met, true);
  assert.equal(get(r, 'bullseye').progress, 5);
  assert.equal(get(r, 'bullseye').near, 1);
  assert.equal(get(r, 'calibrated').progress, 7);
});

test('on-a-roll counts consecutive weekdays, skipping weekends', () => {
  // Thu 22, Fri 23, Mon 26, Tue 27, Wed 28 Oct 2026
  const days = ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28'];
  const events = days.flatMap((d, i) => finished(`r${i}`, `${d}T09:00:00`, 30));
  const r = evaluate(events, new Date('2026-10-28T18:00:00'));
  assert.equal(get(r, 'on-a-roll').met, true);
  assert.equal(get(r, 'on-a-roll').near, 5);
});

test('promise keeper needs 25 on time and 85% of the last 25 dated', () => {
  const events = [];
  for (let i = 0; i < 25; i++) events.push(...finished(`k${i}`, Date.parse('2026-10-01T09:00:00') + i * 3600000, 30, { due: '2026-10-05' }));
  let r = evaluate(events, new Date('2026-10-03'));
  assert.equal(get(r, 'promise-keeper').met, true);
  for (let i = 0; i < 5; i++) events.push(...finished(`late${i}`, Date.parse('2026-10-10T09:00:00') + i * 3600000, 30, { due: '2026-10-05' }));
  r = evaluate(events, new Date('2026-10-11'));
  assert.equal(get(r, 'promise-keeper').met, false);
});

test('newlyMet and points', () => {
  const results = [{ id: 'first-task', met: true }, { id: 'tasks-10', met: false }];
  assert.deepEqual(newlyMet(results, []), ['first-task']);
  assert.deepEqual(newlyMet(results, ['first-task']), []);
  assert.equal(pointsOf(['first-task', 'tasks-10']), 25);
});

test('hints: one per local day, never-shown first, then oldest', () => {
  const results = evaluate([], new Date());
  const pool = hintPool(results, []);
  assert.equal(pool.length, 5);
  const now = new Date('2026-10-28T12:00:00');
  const first = pickHint(pool, { last_at: null, days: {} }, now);
  assert.ok(first);
  assert.equal(first.day, '2026-10-28');
  assert.equal(pickHint(pool, { last_at: '2026-10-28T08:00:00', days: {} }, now), null);
  const days = Object.fromEntries(pool.map((h, i) => [h.id, `2026-10-2${i}`]));
  assert.equal(pickHint(pool, { last_at: '2026-10-27T08:00:00', days }, now).id, pool[0].id);
});

test('view masks locked secrets unless close, and queues unseen unlocks with camos', () => {
  const results = evaluate([], new Date());
  results.find((r) => r.id === 'eat-the-frog').near = 4;
  const v = buildView({
    rows: [{ id: 'first-task', unlocked_at: '2026-10-01T00:00:00Z', seen: 0 }, { id: 'tasks-10', unlocked_at: '2026-10-02T00:00:00Z', seen: 1 }],
    results, hints: { last_at: null, days: { marathon: '2026-10-01' } },
  });
  const frog = v.achievements.find((a) => a.id === 'eat-the-frog');
  assert.equal(frog.name, null);
  assert.equal(frog.clue, CLUES['eat-the-frog']);
  assert.equal(frog.progress, 4);
  const owl = v.achievements.find((a) => a.id === 'night-owl');
  assert.deepEqual([owl.name, owl.desc, owl.goal, owl.progress, owl.clue], [null, null, null, null, null]);
  const marathon = v.achievements.find((a) => a.id === 'marathon');
  assert.equal(marathon.clue, CLUES.marathon);
  assert.equal(v.points, 25);
  assert.deepEqual(v.camos, ['desert', 'arctic']);
  assert.deepEqual(v.queue, [{ id: 'first-task', name: 'Off the Line', points: 10, hidden: false, camos: ['desert'] }]);
  assert.equal(v.achievements.find((a) => a.id === 'first-task').progress, 1);
});
