/**
 * board.js — which cards a column shows and in what order (pure).
 */

import { daysUntil } from './dates.js';
import { agentRank } from './agent.js';

const dueKey = (t, now) => (t.due ? daysUntil(t.due, now) : 999);

function defaultCompare(now) {
  return (a, b) => (a.priority - b.priority) || (dueKey(a, now) - dueKey(b, now));
}

export function sortColumn(tasks, colId, now = new Date()) {
  const list = [...tasks];
  if (colId === 'done') {
    return list.sort((a, b) => String(b.completed_at ?? '').localeCompare(String(a.completed_at ?? '')));
  }
  const base = defaultCompare(now);
  if (colId === 'claude') {
    return list.sort((a, b) => (agentRank(a.agent_state) - agentRank(b.agent_state)) || base(a, b));
  }
  return list.sort(base);
}

/** Done shows the last workday: 72h on a Monday, 24h otherwise. */
export function doneWindowMs(now = new Date()) {
  return (now.getDay() === 1 ? 72 : 24) * 3600000;
}

export function inDoneWindow(task, now = new Date()) {
  if (!task.completed_at) return false;
  return now.getTime() - new Date(task.completed_at).getTime() <= doneWindowMs(now);
}

export function matchesSearch(task, q) {
  if (!q) return true;
  const n = q.toLowerCase();
  return task.title.toLowerCase().includes(n) || String(task.desc ?? '').toLowerCase().includes(n);
}

/** Every card the board would show: Done window, then search, then feature filter. */
export function boardTasks(tasks, { search = '', featureFilter = [], now = new Date() } = {}) {
  return tasks.filter(
    (t) =>
      (t.status !== 'done' || inDoneWindow(t, now)) &&
      matchesSearch(t, search) &&
      (featureFilter.length === 0 || featureFilter.includes(t.feature)),
  );
}
