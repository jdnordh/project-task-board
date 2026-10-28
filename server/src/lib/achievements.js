/**
 * achievements.js — the achievement catalogue and every rule that decides
 * progress, unlocks, hints and what the page may show (pure).
 *
 * Evidence is the append-only activity_log, never current task rows: rows
 * get edited after the fact (completed_at clears on leaving Done, est stays
 * editable), the log does not.
 */

import { IN_PROGRESS } from './constants.js';
import { localDate, parseLocalDate, addDays, weekStart } from './dates.js';
import { CAMOS, SKINS, camosAt, camosCrossed } from './skins.js';

export const CATALOGUE = [
  { id: 'first-task', name: 'Off the Line', desc: 'Finish a task that went through In Progress.', points: 10, goal: 1 },
  { id: 'tasks-10', name: 'Warming Up', desc: 'Finish 10 tasks that went through In Progress.', points: 15, goal: 10 },
  { id: 'tasks-50', name: 'Workhorse', desc: 'Finish 50 tasks that went through In Progress.', points: 25, goal: 50 },
  { id: 'tasks-150', name: 'Mainstay', desc: 'Finish 150 tasks that went through In Progress.', points: 40, goal: 150 },
  { id: 'tasks-500', name: 'Legend', desc: 'Finish 500 tasks that went through In Progress.', points: 60, goal: 500 },
  { id: 'promise-keeper', name: 'Promise Keeper', desc: 'Finish 25 dated tasks on time, with at least 85% of your last 25 dated tasks on time.', points: 30, goal: 25 },
  { id: 'calibrated', name: 'Calibrated', desc: 'Finish 10 tasks of 1h or more within 25% of the estimate.', points: 25, goal: 10 },
  { id: 'early-bird', name: 'Ahead of Schedule', desc: 'Finish 10 dated tasks at least a day before they are due.', points: 20, goal: 10 },
  { id: 'box-ticker', name: 'Box Ticker', desc: 'Finish 10 tasks that have 3 or more subtasks, every one ticked.', points: 20, goal: 10 },
  { id: 'pair-programmer', name: 'Pair Programmer', desc: 'Finish 10 tasks that went through the Claude column.', points: 25, goal: 10 },
  { id: 'spread-out', name: 'Spread Out', desc: 'Finish tasks in 5 different features.', points: 15, goal: 5 },
  { id: 'big-week', name: 'Big Week', desc: 'Finish 10 tasks in one week, Monday to Sunday.', points: 30, goal: 10 },
  { id: 'on-a-roll', name: 'On a Roll', desc: 'Finish a task 5 weekdays in a row.', points: 20, goal: 5 },

  { id: 'eat-the-frog', name: 'Eat the Frog', desc: 'Finish 5 priority-1 tasks within a day of starting them.', points: 20, goal: 5, hidden: true },
  { id: 'night-owl', name: 'Night Owl', desc: 'Finish 3 tasks between midnight and 4 a.m.', points: 25, goal: 3, hidden: true },
  { id: 'unstuck', name: 'Unstuck', desc: 'Finish 5 tasks that were blocked on the way.', points: 30, goal: 5, hidden: true },
  { id: 'bullseye', name: 'Bullseye', desc: 'Finish 5 tasks in a row within 15% of the estimate.', points: 40, goal: 5, hidden: true },
  { id: 'marathon', name: 'Marathon', desc: 'Finish a task every weekday for 8 weeks in a row.', points: 60, goal: 8, hidden: true },
];

export const CLUES = {
  'eat-the-frog': 'The worst job tastes best when you eat it first.',
  'night-owl': 'Some work best while the house is asleep.',
  unstuck: 'What was stuck is sweeter once it moves.',
  bullseye: 'Say what it takes. Then take exactly that, again and again.',
  marathon: 'Show up every weekday. Then keep showing up for two months.',
};

export const STREAK_GOALS = new Set(['on-a-roll', 'bullseye', 'marathon']);

const MIN_WORK_MS = 30 * 1000;
const isWeekday = (d) => d.getDay() >= 1 && d.getDay() <= 5;

/**
 * Turn task_status log events into counted completions. A task counts once,
 * on its first completion, only if it went through In Progress first, at
 * least 30s passed since that start, and the start estimate was > 0.
 */
export function completions(events) {
  const byTask = new Map();
  for (const e of events) {
    if (e.kind !== 'task_status') continue;
    const id = e.data.task ?? e.ref_id;
    if (!byTask.has(id)) byTask.set(id, []);
    byTask.get(id).push(e);
  }
  const out = [];
  for (const [task, list] of byTask) {
    let start = null;
    let claude = false;
    let blocked = false;
    for (const e of list) {
      const to = e.data.to;
      if (to === 'claude') claude = true;
      if (to === 'blocked') blocked = true;
      if (!start && IN_PROGRESS.has(to)) start = e;
      if (to === 'done') {
        // Only the first completion ever counts.
        if (start) {
          const startAt = new Date(start.at);
          const doneAt = new Date(e.at);
          const est = Number(start.data.est) || 0;
          if (doneAt - startAt >= MIN_WORK_MS && est > 0) {
            out.push({
              task, startAt, doneAt, est, due: start.data.due ?? null, priority: start.data.priority,
              feature: e.data.feature ?? start.data.feature, subsTotal: e.data.subs_total ?? 0, subsDone: e.data.subs_done ?? 0,
              claude, blocked,
            });
          }
        }
        break;
      }
    }
  }
  return out.sort((a, b) => a.doneAt - b.doneAt);
}

const hours = (c) => (c.doneAt - c.startAt) / 3600000;
const within = (c, pct) => Math.abs(hours(c) - c.est) <= pct * c.est;

/** Longest and current run of consecutive weekdays with a completion. */
function weekdayRuns(days, now) {
  const set = new Set(days);
  if (!set.size) return { best: 0, current: 0 };
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const s of sorted) {
    const d = parseLocalDate(s);
    if (!isWeekday(d)) continue;
    if (prev && localDate(nextWeekday(prev)) === s) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = d;
  }
  // Current: ending today, or the last weekday before today if today has none yet.
  let cursor = parseLocalDate(localDate(now));
  while (!isWeekday(cursor)) cursor = addDays(cursor, -1);
  if (!set.has(localDate(cursor))) cursor = prevWeekday(cursor);
  let current = 0;
  while (set.has(localDate(cursor))) {
    current += 1;
    cursor = prevWeekday(cursor);
  }
  return { best, current };
}

function nextWeekday(d) {
  let n = addDays(d, 1);
  while (!isWeekday(n)) n = addDays(n, 1);
  return n;
}
function prevWeekday(d) {
  let n = addDays(d, -1);
  while (!isWeekday(n)) n = addDays(n, -1);
  return n;
}

/** Runs of consecutive weeks where every weekday has a completion. */
function fullWeekRuns(days, now) {
  const set = new Set(days);
  const full = (monday) => [0, 1, 2, 3, 4].every((i) => set.has(localDate(addDays(monday, i))));
  if (!set.size) return { best: 0, current: 0 };
  const first = weekStart(parseLocalDate([...set].sort()[0]));
  const thisWeek = weekStart(now);
  let best = 0;
  let run = 0;
  for (let w = first; w <= thisWeek; w = addDays(w, 7)) {
    if (full(w)) best = Math.max(best, ++run);
    else if (w.getTime() !== thisWeek.getTime()) run = 0;
  }
  let cursor = full(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let current = 0;
  while (full(cursor)) {
    current += 1;
    cursor = addDays(cursor, -7);
  }
  return { best, current };
}

/** Progress for every achievement: `{ id, progress, goal, met, near }`. */
export function evaluate(events, now = new Date()) {
  const done = completions(events);
  const count = (pred) => done.filter(pred).length;
  const dated = done.filter((c) => c.due);
  const onTime = (c) => localDate(c.doneAt) <= c.due;
  const last25 = dated.slice(-25);
  const doneDays = done.map((c) => localDate(c.doneAt));

  const weekCounts = new Map();
  for (const c of done) {
    const k = localDate(weekStart(c.doneAt));
    weekCounts.set(k, (weekCounts.get(k) ?? 0) + 1);
  }

  let bullBest = 0;
  let bullRun = 0;
  for (const c of done) {
    if (c.est < 1) continue;
    bullRun = within(c, 0.15) ? bullRun + 1 : 0;
    bullBest = Math.max(bullBest, bullRun);
  }
  const roll = weekdayRuns(doneDays, now);
  const weeks = fullWeekRuns(doneDays, now);

  const raw = {
    'first-task': done.length,
    'tasks-10': done.length,
    'tasks-50': done.length,
    'tasks-150': done.length,
    'tasks-500': done.length,
    'promise-keeper': count((c) => c.due && onTime(c)),
    calibrated: count((c) => c.est >= 1 && within(c, 0.25)),
    'early-bird': count((c) => c.due && localDate(addDays(c.doneAt, 1)) <= c.due),
    'box-ticker': count((c) => c.subsTotal >= 3 && c.subsDone === c.subsTotal),
    'pair-programmer': count((c) => c.claude),
    'spread-out': new Set(done.map((c) => c.feature)).size,
    'big-week': Math.max(0, ...weekCounts.values()),
    'on-a-roll': { best: roll.best, current: roll.current },
    'eat-the-frog': count((c) => c.priority === 1 && c.doneAt - c.startAt <= 86400000),
    'night-owl': count((c) => c.doneAt.getHours() < 4),
    unstuck: count((c) => c.blocked),
    bullseye: { best: bullBest, current: bullRun },
    marathon: weeks,
  };

  return CATALOGUE.map((a) => {
    const r = raw[a.id];
    const best = typeof r === 'object' ? r.best : r;
    const near = typeof r === 'object' ? r.current : r;
    let met = best >= a.goal;
    if (a.id === 'promise-keeper') met = met && last25.filter(onTime).length >= 0.85 * last25.length;
    return { id: a.id, progress: Math.min(best, a.goal), goal: a.goal, met, near: Math.min(near, a.goal) };
  });
}

/** Ids that are met and not yet unlocked. Unlocks are sticky: only ever insert. */
export function newlyMet(results, unlocked) {
  const have = new Set(unlocked);
  return results.filter((r) => r.met && !have.has(r.id)).map((r) => r.id);
}

export function pointsOf(ids) {
  const set = new Set(ids);
  return CATALOGUE.filter((a) => set.has(a.id)).reduce((s, a) => s + a.points, 0);
}

export const TOTAL_POINTS = CATALOGUE.reduce((s, a) => s + a.points, 0);

/** Secrets that could still be hinted, closest first. */
export function hintPool(results, unlocked) {
  const have = new Set(unlocked);
  return CATALOGUE.filter((a) => a.hidden && CLUES[a.id])
    .map((a) => ({ a, r: results.find((x) => x.id === a.id) }))
    .filter(({ a, r }) => r && !r.met && !have.has(a.id))
    .map(({ a, r }) => ({ id: a.id, clue: CLUES[a.id], progress: r.near, goal: a.goal }))
    .sort((x, y) => y.progress / y.goal - x.progress / x.goal);
}

export function parseHints(raw) {
  try {
    const v = JSON.parse(raw ?? '');
    return { last_at: v?.last_at ?? null, days: v?.days && typeof v.days === 'object' ? v.days : {} };
  } catch {
    return { last_at: null, days: {} };
  }
}

/** One hint per local day: the never-shown one, else the one shown longest ago. */
export function pickHint(pool, state, now = new Date()) {
  const today = localDate(now);
  if (state.last_at && localDate(new Date(state.last_at)) === today) return null;
  if (!pool.length) return null;
  const fresh = pool.filter((h) => !state.days[h.id]);
  const pick = fresh[0] ?? [...pool].sort((x, y) => String(state.days[x.id]).localeCompare(String(state.days[y.id])))[0];
  return { ...pick, day: today };
}

/**
 * What the page may see. A locked secret is masked, unless it is "close":
 * in the hint pool and at ≥80% or already given as a hint.
 */
export function buildView({ rows, results, hints }) {
  const unlocked = rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const points = pointsOf(unlocked);
  const pool = hintPool(results, unlocked);
  const achievements = CATALOGUE.map((a) => {
    const row = byId.get(a.id);
    const r = results.find((x) => x.id === a.id);
    const base = { id: a.id, hidden: !!a.hidden, points: a.points, unlocked_at: row?.unlocked_at ?? null, seen: row ? !!row.seen : false };
    if (row) return { ...base, name: a.name, desc: a.desc, clue: a.hidden ? CLUES[a.id] ?? null : null, goal: a.goal, progress: a.goal };
    if (!a.hidden) return { ...base, name: a.name, desc: a.desc, clue: null, goal: a.goal, progress: r?.progress ?? 0 };
    const h = pool.find((x) => x.id === a.id);
    const close = !!h && (h.progress / h.goal >= 0.8 || !!hints.days[a.id]);
    return { ...base, name: null, desc: null, clue: close ? CLUES[a.id] : null, goal: close ? a.goal : null, progress: close ? h.progress : null };
  });

  const order = (x, y) => x.unlocked_at.localeCompare(y.unlocked_at) || CATALOGUE.findIndex((a) => a.id === x.id) - CATALOGUE.findIndex((a) => a.id === y.id);
  const sorted = [...rows].sort(order);
  let running = 0;
  const queue = [];
  for (const row of sorted) {
    const a = CATALOGUE.find((x) => x.id === row.id);
    if (!a) continue;
    const before = running;
    running += a.points;
    if (!row.seen) queue.push({ id: a.id, name: a.name, points: a.points, hidden: !!a.hidden, camos: camosCrossed(before, running) });
  }
  return { points, total_points: TOTAL_POINTS, camos: camosAt(points), achievements, queue };
}

export { CAMOS, SKINS };
