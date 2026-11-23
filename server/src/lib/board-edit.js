/**
 * board-edit.js — rules for the MCP board tools' task and project writes
 * (pure, browser-safe). The REST API still validates every value; these
 * rules turn the friendlier MCP input (project names, subtasks as text)
 * into an API body and catch mistakes with a clearer message.
 */

import { COLUMN_IDS, PROJECT_PALETTE, CLAUDE_MODELS, CLAUDE_EFFORTS } from './constants.js';
import { isRealDate } from './dates.js';
import { findProject } from './buddy.js';

export const TASK_EDIT_FIELDS = [
  'title', 'project', 'priority', 'est', 'due', 'status', 'desc', 'subtasks', 'claude_model', 'claude_effort', 'repo_path',
];
export const PROJECT_EDIT_FIELDS = ['name', 'color', 'completed', 'position', 'skin', 'claude_model', 'claude_effort', 'repo_path'];

/** Shared checks for the Claude setup fields; '' and null clear them. */
function setupFields(fields, value) {
  const has = (k) => fields[k] !== undefined;
  const clear = (v) => v === '' || v === null;
  if (has('claude_model')) {
    if (!clear(fields.claude_model) && !CLAUDE_MODELS.some((m) => m.id === fields.claude_model)) {
      return `claude_model must be one of ${CLAUDE_MODELS.map((m) => m.id).join(', ')}, or null`;
    }
    value.claude_model = clear(fields.claude_model) ? null : fields.claude_model;
  }
  if (has('claude_effort')) {
    if (!clear(fields.claude_effort) && !CLAUDE_EFFORTS.includes(fields.claude_effort)) {
      return `claude_effort must be one of ${CLAUDE_EFFORTS.join(', ')}, or null`;
    }
    value.claude_effort = clear(fields.claude_effort) ? null : fields.claude_effort;
  }
  if (has('repo_path')) value.repo_path = clear(fields.repo_path) ? null : fields.repo_path;
  return null;
}

/**
 * Move one id to a 1-based position in an ordered id list. Returns the
 * `{ id, sort_order }` pairs whose order changed (1..n after the move).
 */
export function reorderIds(ordered, id, position) {
  const rest = ordered.filter((x) => x.id !== id);
  const at = Math.min(Math.max(1, position), rest.length + 1) - 1;
  const me = ordered.find((x) => x.id === id);
  if (!me) return [];
  rest.splice(at, 0, me);
  return rest.map((x, i) => ({ id: x.id, sort_order: i + 1, was: x.sort_order })).filter((x) => x.sort_order !== x.was)
    .map(({ id: i, sort_order }) => ({ id: i, sort_order }));
}

/** The first palette colour no project uses yet, else cycle by count. */
export function nextProjectColor(projects = []) {
  const used = new Set(projects.map((p) => String(p.color).toLowerCase()));
  const free = PROJECT_PALETTE.find((c) => !used.has(c.hex.toLowerCase()));
  return (free ?? PROJECT_PALETTE[projects.length % PROJECT_PALETTE.length]).hex;
}

/** Subtasks as text ("[x] done" ticks it) or { t, done } → API subtasks. */
export function toSubtasks(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const s of list) {
    if (typeof s === 'string') {
      const m = s.match(/^\s*\[( |x|X)\]\s*(.*)$/);
      const t = (m ? m[2] : s).trim();
      if (!t) return null;
      out.push({ t, done: !!m && m[1] !== ' ' });
    } else if (s && typeof s.t === 'string' && s.t.trim()) {
      out.push({ t: s.t.trim(), done: !!s.done });
    } else {
      return null;
    }
  }
  return out;
}

/**
 * Check a create_task / update_task call. `create` needs a title and a
 * project. Returns `{ value }` ready for POST/PATCH /api/tasks, or `{ error }`.
 * `project` may be an id or a name (any case); `due: null` and
 * `repo_path: null` clear the value.
 */
export function checkTaskEdit(input, projects, { create = false } = {}) {
  const fields = input ?? {};
  const unknown = Object.keys(fields).filter((k) => !TASK_EDIT_FIELDS.includes(k));
  if (unknown.length) return { error: `Unknown field(s): ${unknown.join(', ')}. Allowed: ${TASK_EDIT_FIELDS.join(', ')}` };
  const has = (k) => fields[k] !== undefined;
  const value = {};
  if (create || has('title')) {
    if (typeof fields.title !== 'string' || !fields.title.trim()) return { error: 'title must be non-empty text' };
    value.title = fields.title.trim();
  }
  if (create || has('project')) {
    const p = findProject(fields.project, projects);
    if (!p) return { error: `Unknown project "${fields.project ?? ''}". Projects: ${projects.map((x) => x.name).join(', ') || 'none'}` };
    value.project = p.id;
  }
  if (has('status')) {
    if (!COLUMN_IDS.includes(fields.status)) return { error: `status must be one of ${COLUMN_IDS.join(', ')}` };
    value.status = fields.status;
  }
  if (has('priority')) {
    if (!(Number.isInteger(fields.priority) && fields.priority >= 1 && fields.priority <= 9)) {
      return { error: 'priority must be a whole number 1–9 (1 is most urgent)' };
    }
    value.priority = fields.priority;
  }
  if (has('est')) {
    if (!(typeof fields.est === 'number' && fields.est > 0 && fields.est <= 80)) return { error: 'est must be hours, more than 0 and at most 80' };
    value.est = fields.est;
  }
  if (has('due')) {
    if (fields.due !== null && fields.due !== '' && !isRealDate(fields.due)) return { error: 'due must be a real YYYY-MM-DD date, or null to clear it' };
    value.due = fields.due || null;
  }
  if (has('desc')) {
    if (typeof fields.desc !== 'string') return { error: 'desc must be text' };
    value.desc = fields.desc;
  }
  if (has('subtasks')) {
    const subs = toSubtasks(fields.subtasks);
    if (!subs) return { error: 'subtasks must be a list of non-empty strings ("[x] text" for a ticked one) or { t, done } objects' };
    value.subtasks = subs;
  }
  const bad = setupFields(fields, value);
  if (bad) return { error: bad };
  if (!create && !Object.keys(value).length) return { error: 'Nothing to change: pass at least one field.' };
  return { value };
}

/**
 * Check a create_project / update_project call. Returns `{ value }` ready
 * for POST/PATCH /api/projects (a `position` is applied with reorderIds), or `{ error }`.
 * A new project without a colour gets the next free palette colour.
 */
export function checkProjectEdit(input, projects = [], { create = false } = {}) {
  const fields = input ?? {};
  const unknown = Object.keys(fields).filter((k) => !PROJECT_EDIT_FIELDS.includes(k));
  if (unknown.length) return { error: `Unknown field(s): ${unknown.join(', ')}. Allowed: ${PROJECT_EDIT_FIELDS.join(', ')}` };
  const has = (k) => fields[k] !== undefined;
  const value = {};
  if (create || has('name')) {
    if (typeof fields.name !== 'string' || !fields.name.trim()) return { error: 'name must be non-empty text' };
    value.name = fields.name.trim();
  }
  if (has('color')) {
    if (typeof fields.color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(fields.color.trim())) return { error: 'color must be a hex colour like #38E1FF' };
    value.color = fields.color.trim();
  } else if (create) {
    value.color = nextProjectColor(projects);
  }
  if (has('completed')) {
    if (typeof fields.completed !== 'boolean') return { error: 'completed must be true or false' };
    value.completed = fields.completed;
  }
  if (has('position')) {
    if (!(Number.isInteger(fields.position) && fields.position >= 1)) return { error: 'position must be a whole number from 1' };
    value.position = fields.position;
  }
  if (has('skin')) value.skin = fields.skin === '' ? null : fields.skin;
  const bad = setupFields(fields, value);
  if (bad) return { error: bad };
  if (!create && !Object.keys(value).length) return { error: 'Nothing to change: pass at least one field.' };
  return { value };
}
