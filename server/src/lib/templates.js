/**
 * templates.js — task template rules (pure, browser-safe).
 *
 * A template's `fields` is a partial task. An absent key means "unset" and
 * leaves the task's own value alone; null is never stored.
 */

import { COLUMN_IDS, cleanModel, cleanEffort } from './constants.js';
import { stripHtml, textToHtml } from './desc.js';
import { localDate, addDays, endOfWeek } from './dates.js';
import { fmtHours } from './format.js';
import { setupLabel } from './agent.js';

export const TEMPLATE_FIELDS = [
  'title', 'feature', 'status', 'priority', 'est', 'due', 'desc_html', 'subtasks', 'claude_model', 'claude_effort',
];

function cleanSubtasks(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const s of list) {
    const t = typeof s === 'string' ? s : s && typeof s.t === 'string' ? s.t : null;
    if (t === null) return null;
    const trimmed = t.trim();
    if (trimmed) out.push({ t: trimmed, done: false });
  }
  return out;
}

function cleanDue(due) {
  if (!due || typeof due !== 'object') return null;
  if (due.kind === 'today' || due.kind === 'eow') return { kind: due.kind };
  if (due.kind === 'days' && Number.isInteger(due.n) && due.n >= 0 && due.n <= 365) return { kind: 'days', n: due.n };
  return null;
}

/** Returns `{ value }` or `{ error }`. */
export function validateTemplate(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') return { error: 'body must be an object' };
  for (const k of Object.keys(body)) {
    if (k !== 'name' && k !== 'fields') return { error: `unknown key: ${k}` };
  }
  const value = {};
  if (body.name !== undefined || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return { error: 'name is required' };
    if (name.length > 80) return { error: 'name must be at most 80 characters' };
    value.name = name;
  }
  if (body.fields !== undefined || !partial) {
    const f = body.fields ?? {};
    if (typeof f !== 'object' || Array.isArray(f)) return { error: 'fields must be an object' };
    const out = {};
    for (const [k, v] of Object.entries(f)) {
      if (k !== 'desc' && !TEMPLATE_FIELDS.includes(k)) return { error: `unknown field: ${k}` };
      if (v === null || v === undefined) continue;
      switch (k) {
        case 'title': {
          if (typeof v !== 'string') return { error: 'title must be text' };
          const t = v.trim();
          if (t.length > 200) return { error: 'title must be at most 200 characters' };
          if (t) out.title = t;
          break;
        }
        case 'feature':
          if (typeof v !== 'string' || !v) return { error: 'feature must be a feature id' };
          out.feature = v;
          break;
        case 'status':
          if (!COLUMN_IDS.includes(v)) return { error: 'status must be a column id' };
          out.status = v;
          break;
        case 'priority':
          if (!Number.isInteger(v) || v < 1 || v > 9) return { error: 'priority must be a whole number 1–9' };
          out.priority = v;
          break;
        case 'est':
          if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 80) return { error: 'est must be 0–80' };
          out.est = v;
          break;
        case 'due': {
          const d = cleanDue(v);
          if (!d) return { error: 'due must be {kind:"today"|"eow"} or {kind:"days", n:0..365}' };
          out.due = d;
          break;
        }
        case 'desc':
          if (typeof v !== 'string') return { error: 'desc must be text' };
          if (v.trim() && out.desc_html === undefined) out.desc_html = textToHtml(v);
          break;
        case 'desc_html':
          if (typeof v !== 'string') return { error: 'desc_html must be text' };
          if (stripHtml(v)) out.desc_html = v;
          else delete out.desc_html;
          break;
        case 'subtasks': {
          const s = cleanSubtasks(v);
          if (!s) return { error: 'subtasks must be a list of text' };
          if (s.length) out.subtasks = s;
          break;
        }
        case 'claude_model':
          if (!cleanModel(v)) return { error: 'claude_model is not a known model' };
          out.claude_model = v;
          break;
        case 'claude_effort':
          if (!cleanEffort(v)) return { error: 'claude_effort is not a known effort' };
          out.claude_effort = v;
          break;
      }
    }
    value.fields = out;
  }
  return { value };
}

/** A template's relative due date → a local `YYYY-MM-DD`. */
export function resolveDue(due, now = new Date()) {
  if (!due) return null;
  if (due.kind === 'today') return localDate(now);
  if (due.kind === 'eow') return localDate(endOfWeek(now));
  if (due.kind === 'days') return localDate(addDays(now, due.n));
  return null;
}

/**
 * Scalars replace; notes and subtasks add, never twice.
 * @template T
 * @param {T} draft
 * @param {object} fields
 * @param {{ featureIds?: string[], now?: Date }} [opts]
 * @returns {T}
 */
export function applyTemplate(draft, fields, { featureIds, now = new Date() } = {}) {
  const next = { ...draft, subtasks: [...(draft.subtasks ?? [])] };
  for (const k of ['title', 'status', 'priority', 'est', 'claude_model', 'claude_effort']) {
    if (fields[k] !== undefined) next[k] = fields[k];
  }
  if (fields.due !== undefined) next.due = resolveDue(fields.due, now);
  if (fields.feature !== undefined && (!featureIds || featureIds.includes(fields.feature))) {
    next.feature = fields.feature;
  }
  if (fields.desc_html) {
    const own = draft.desc_html || textToHtml(draft.desc ?? '');
    if (!own.includes(fields.desc_html)) {
      next.desc_html = own + fields.desc_html;
      next.desc = stripHtml(next.desc_html);
    }
  }
  if (fields.subtasks?.length) {
    const have = new Set(next.subtasks.map((s) => s.t.trim().toLowerCase()));
    for (const s of fields.subtasks) {
      const key = s.t.trim().toLowerCase();
      if (have.has(key)) continue;
      have.add(key);
      next.subtasks.push({ t: s.t, done: false });
    }
  }
  return next;
}

/** "Save as template": everything but the due date, a done status, empty parts, and inherited Claude settings. */
export function fieldsFromTask(task) {
  const f = {};
  if (task.title?.trim()) f.title = task.title.trim();
  if (task.feature) f.feature = task.feature;
  if (task.status && task.status !== 'done') f.status = task.status;
  if (Number.isInteger(task.priority)) f.priority = task.priority;
  if (typeof task.est === 'number') f.est = task.est;
  const html = task.desc_html || textToHtml(task.desc ?? '');
  if (stripHtml(html)) f.desc_html = html;
  const subs = (task.subtasks ?? []).map((s) => s.t.trim()).filter(Boolean);
  if (subs.length) f.subtasks = subs.map((t) => ({ t, done: false }));
  if (task.claude_model) f.claude_model = task.claude_model;
  if (task.claude_effort) f.claude_effort = task.claude_effort;
  return f;
}

/** Used templates first (most recent), then unused ones by name. */
export function recentTemplates(list, n = 3) {
  const used = list.filter((t) => t.last_used_at).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at));
  const unused = list.filter((t) => !t.last_used_at).sort((a, b) => a.name.localeCompare(b.name));
  return [...used, ...unused].slice(0, n);
}

export function dueLabel(due) {
  if (!due) return '';
  if (due.kind === 'today') return 'Due today';
  if (due.kind === 'eow') return 'Due end of week';
  if (due.n === 0) return 'Due today';
  return `Due in ${due.n} day${due.n === 1 ? '' : 's'}`;
}

export function templateSummary(fields, features = []) {
  const parts = [];
  if (fields.feature) {
    const f = features.find((x) => x.id === fields.feature);
    if (f) parts.push(f.name);
  }
  if (fields.priority) parts.push(`P${fields.priority}`);
  if (fields.est !== undefined) parts.push(fmtHours(fields.est));
  if (fields.due) parts.push(dueLabel(fields.due));
  if (fields.subtasks?.length) parts.push(`${fields.subtasks.length} subtask${fields.subtasks.length === 1 ? '' : 's'}`);
  const setup = setupLabel({ model: fields.claude_model, effort: fields.claude_effort });
  if (setup) parts.push(setup);
  return parts.join(' · ');
}
