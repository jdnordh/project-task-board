/**
 * buddy.js — rules for the Buddy orchestrator's writes (pure, browser-safe).
 */

import { isRealDate } from './dates.js';
import { agentRank } from './agent.js';

export const BUDDY_TASK_FIELDS = ['title', 'feature', 'priority', 'est', 'due', 'status', 'desc', 'subtasks'];
export const BUDDY_STATUSES = ['backlog', 'week'];

/** Feature by id, else by name (any case), else null. */
export function findFeature(ref, features) {
  const r = String(ref ?? '').trim();
  return features.find((f) => f.id === r) ?? features.find((f) => f.name.toLowerCase() === r.toLowerCase()) ?? null;
}

/**
 * Check a create_task call. Returns `{ value }` (ready for POST /api/tasks;
 * `est` left out when not given so the user's default applies) or `{ error }`.
 */
export function checkBuddyTask(input, features) {
  const unknown = Object.keys(input ?? {}).filter((k) => !BUDDY_TASK_FIELDS.includes(k));
  if (unknown.length) return { error: `Unknown field(s): ${unknown.join(', ')}. Allowed: ${BUDDY_TASK_FIELDS.join(', ')}` };
  const { title, feature, priority, est, due, status = 'backlog', desc, subtasks } = input;
  if (typeof title !== 'string' || !title.trim()) return { error: 'title must be non-empty text' };
  const f = findFeature(feature, features);
  if (!f) return { error: `Unknown feature "${feature}". Features: ${features.map((x) => x.name).join(', ')}` };
  if (!BUDDY_STATUSES.includes(status)) return { error: 'status must be backlog or week' };
  if (priority !== undefined && !(Number.isInteger(priority) && priority >= 1 && priority <= 9)) {
    return { error: 'priority must be a whole number 1–9 (1 is most urgent)' };
  }
  if (est !== undefined && !(typeof est === 'number' && est > 0 && est <= 80)) return { error: 'est must be hours, more than 0 and at most 80' };
  if (due !== undefined && due !== null && !isRealDate(due)) return { error: 'due must be a real YYYY-MM-DD date' };
  if (desc !== undefined && typeof desc !== 'string') return { error: 'desc must be text' };
  if (subtasks !== undefined && !(Array.isArray(subtasks) && subtasks.every((s) => typeof s === 'string' && s.trim()))) {
    return { error: 'subtasks must be a list of non-empty strings' };
  }
  const value = { title: title.trim(), feature: f.id, status };
  if (priority !== undefined) value.priority = priority;
  if (est !== undefined) value.est = est;
  if (due) value.due = due;
  if (desc) value.desc = desc;
  if (subtasks?.length) value.subtasks = subtasks.map((t) => ({ t: t.trim(), done: false }));
  return { value };
}

/** Claude-column order: what needs the user first, then oldest update first. */
export function sortClaude(tasks) {
  return [...tasks].sort((a, b) => agentRank(a.agent_state) - agentRank(b.agent_state) || String(a.agent_at ?? '').localeCompare(String(b.agent_at ?? '')));
}
