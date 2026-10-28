/**
 * achievements.js — reads the activity log and the sticky unlocks table,
 * applies the pure rules in lib/achievements.js, and records unlocks,
 * "seen" marks and shown hints.
 */

import { evaluate, newlyMet, pickHint, hintPool, parseHints, buildView } from './lib/achievements.js';
import { localDate } from './lib/dates.js';
import { HttpError } from './store.js';

export function createAchievements(store) {
  const { db } = store;
  const rows = () => db.prepare('SELECT id, unlocked_at, seen FROM achievements').all();
  const hints = () => parseHints(store.getSettings().achievement_hints);

  function view(results = evaluate(store.activity())) {
    return buildView({ rows: rows(), results, hints: hints() });
  }

  function check(action) {
    const now = new Date();
    const results = evaluate(store.activity(), now);
    const fresh = newlyMet(results, rows().map((r) => r.id));
    const ins = db.prepare('INSERT OR IGNORE INTO achievements (id, unlocked_at, seen) VALUES (?, ?, 0)');
    const ts = now.toISOString();
    for (const id of fresh) ins.run(id, ts);
    const unlocked = rows().map((r) => r.id);
    const hint = action ? pickHint(hintPool(results, unlocked), hints(), now) : null;
    return { ...view(results), new: fresh, hint };
  }

  function markSeen(ids) {
    if (!Array.isArray(ids)) throw new HttpError(400, 'ids must be a list');
    const up = db.prepare('UPDATE achievements SET seen = 1 WHERE id = ?');
    for (const id of ids) if (typeof id === 'string') up.run(id);
    return { ok: true };
  }

  /** Record a hint only once the client says it showed. */
  function hintSeen(id) {
    if (typeof id !== 'string' || !id) throw new HttpError(400, 'id required');
    const h = hints();
    const now = new Date();
    h.last_at = now.toISOString();
    h.days[id] = localDate(now);
    store.patchSettings({ achievement_hints: JSON.stringify(h) });
    return { ok: true };
  }

  return { view: () => view(), check, markSeen, hintSeen };
}
