import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createStore } from '../src/store.js';
import { createAchievements } from '../src/achievements.js';

test('check unlocks from the log, is sticky, and records hints only when seen', () => {
  const store = createStore(openDb(':memory:', { log: () => {} }));
  const ach = createAchievements(store);
  const f = store.listFeatures()[0];
  const t = store.createTask({ title: 'x', feature: f.id, status: 'progress', est: 1 });
  // Backdate the start so the 30s rule passes.
  store.db.prepare("UPDATE activity_log SET at = '2020-01-01T00:00:00.000Z' WHERE ref_id = ?").run(t.id);
  store.updateTask(t.id, { status: 'done' });

  const r = ach.check(true);
  assert.deepEqual(r.new, ['first-task']);
  assert.equal(r.points, 10);
  assert.deepEqual(r.queue.map((q) => q.id), ['first-task']);
  assert.ok(r.hint);
  // Leaving Done does not take the unlock away.
  store.updateTask(t.id, { status: 'week' });
  assert.deepEqual(ach.check(false).new, []);
  assert.equal(ach.view().points, 10);
  assert.equal(ach.check(false).hint, null);

  ach.markSeen(['first-task']);
  assert.deepEqual(ach.view().queue, []);
  ach.hintSeen(r.hint.id);
  assert.equal(ach.check(true).hint, null); // already one today
});
