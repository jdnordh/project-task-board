/**
 * store.js — every database read and write. Routes stay thin; the rules
 * they apply come from the pure modules in ./lib.
 */

import fs from 'node:fs';
import path from 'node:path';
import { genId } from './lib/ids.js';
import {
  COLUMN_IDS, IN_PROGRESS, AGENT_STATES, cleanDefaultEst, cleanModel, cleanEffort,
} from './lib/constants.js';
import { deriveDesc } from './lib/desc.js';
import {
  agentFieldsOnMove, cleanNote, sessionTitle, claudePrompt, claudeSetup, setupLabel, agentRules, resolveRepo,
} from './lib/agent.js';
import { validateTemplate } from './lib/templates.js';
import { cleanSkin } from './lib/skins.js';
import { noteText, countActions, searchNotes } from './lib/notes.js';
import { localDate, isRealDate } from './lib/dates.js';
import { sniffImage, imageIds, IMAGE_MAX_BYTES, IMAGE_EXT } from './lib/images.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const now = () => new Date().toISOString();

export const TASK_FIELDS = [
  'title', 'feature', 'priority', 'est', 'due', 'status', 'desc', 'desc_html', 'subtasks', 'claude_model', 'claude_effort', 'repo_path',
];

export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const REPORT_MAX = 50000;
const ABS_PATH = /^([a-zA-Z]:[\\/]|\/|\\\\)/;
const HTML_EXT = /\.html?$/i;

export function validFilePath(p) {
  return typeof p === 'string' && ABS_PATH.test(p) && HTML_EXT.test(p);
}

/** null/'' → null; otherwise an absolute path (stored with forward slashes). */
function cleanRepoPath(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !ABS_PATH.test(v.trim())) throw new HttpError(400, 'repo_path must be an absolute folder path or null');
  return v.trim().replace(/\\/g, '/');
}

function parseTask(row) {
  if (!row) return row;
  return { ...row, subtasks: JSON.parse(row.subtasks || '[]') };
}

function parseFeature(row) {
  if (!row) return row;
  return { ...row, completed: !!row.completed };
}

function imageUrl(id) {
  return `/api/images/${id}`;
}

function fileUrl(id) {
  return `/api/task-files/${id}`;
}

function checkSubtasks(v) {
  if (!Array.isArray(v)) throw new HttpError(400, 'subtasks must be a list');
  return v.map((s) => {
    if (!s || typeof s.t !== 'string') throw new HttpError(400, 'each subtask needs text');
    return { t: s.t, done: !!s.done };
  });
}

/** Validate and normalise the whitelisted task fields present in `f`. */
function cleanTaskFields(f) {
  const out = {};
  for (const k of TASK_FIELDS) {
    if (!(k in f)) continue;
    const v = f[k];
    switch (k) {
      case 'title':
        if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, 'title must be non-empty text');
        out.title = v.trim();
        break;
      case 'feature':
        if (typeof v !== 'string' || !v) throw new HttpError(400, 'feature must be a feature id');
        out.feature = v;
        break;
      case 'priority':
        if (!Number.isInteger(v) || v < 1 || v > 9) throw new HttpError(400, 'priority must be a whole number 1–9');
        out.priority = v;
        break;
      case 'est':
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 80) throw new HttpError(400, 'est must be 0–80');
        out.est = v;
        break;
      case 'due':
        if (v !== null && !(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))) throw new HttpError(400, 'due must be YYYY-MM-DD or null');
        out.due = v;
        break;
      case 'status':
        if (!COLUMN_IDS.includes(v)) throw new HttpError(400, `status must be one of ${COLUMN_IDS.join(', ')}`);
        out.status = v;
        break;
      case 'subtasks':
        out.subtasks = checkSubtasks(v);
        break;
      case 'claude_model':
        out.claude_model = cleanModel(v);
        break;
      case 'claude_effort':
        out.claude_effort = cleanEffort(v);
        break;
      case 'repo_path':
        out.repo_path = cleanRepoPath(v);
        break;
      case 'desc':
      case 'desc_html':
        if (v !== null && typeof v !== 'string') throw new HttpError(400, `${k} must be text`);
        break;
    }
  }
  Object.assign(out, deriveDesc(f));
  return out;
}

export function createStore(db, { cliPath = '' } = {}) {
  const q = (sql) => db.prepare(sql);

  // ---- settings ------------------------------------------------------------
  function getSettings() {
    return Object.fromEntries(q('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  }
  function patchSettings(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new HttpError(400, 'body must be an object');
    const up = q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(obj)) up.run(k, String(v));
    return getSettings();
  }

  // ---- activity log (append-only) -----------------------------------------
  function logActivity(kind, refId, data) {
    q('INSERT INTO activity_log (at, kind, ref_id, data) VALUES (?, ?, ?, ?)').run(now(), kind, refId, JSON.stringify(data ?? {}));
  }
  function activity() {
    return q('SELECT id, at, kind, ref_id, data FROM activity_log ORDER BY id').all().map((r) => ({ ...r, data: JSON.parse(r.data) }));
  }
  function logStatus(task, from) {
    logActivity('task_status', task.id, {
      task: task.id, from, to: task.status, est: task.est, due: task.due, priority: task.priority, feature: task.feature,
      subs_total: task.subtasks.length, subs_done: task.subtasks.filter((s) => s.done).length,
    });
  }

  // ---- features ------------------------------------------------------------
  const getFeature = (id) => parseFeature(q('SELECT * FROM features WHERE id = ?').get(id));
  function listFeatures() {
    return q('SELECT * FROM features ORDER BY sort_order').all().map(parseFeature);
  }
  function createFeature(body) {
    const { name, color } = body ?? {};
    if (typeof name !== 'string' || !name.trim() || typeof color !== 'string' || !color) {
      throw new HttpError(400, 'name and color required');
    }
    const id = genId('f-');
    const order = q('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM features').get().n;
    q(`INSERT INTO features (id, name, color, sort_order, skin, claude_model, claude_effort, repo_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name.trim(), color, order, cleanSkin(body.skin), cleanModel(body.claude_model), cleanEffort(body.claude_effort),
        cleanRepoPath(body.repo_path));
    return getFeature(id);
  }
  function updateFeature(id, body) {
    if (!getFeature(id)) throw new HttpError(404, 'feature not found');
    const set = {};
    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) throw new HttpError(400, 'name must be non-empty');
      set.name = body.name.trim();
    }
    if ('color' in body) {
      if (typeof body.color !== 'string' || !body.color) throw new HttpError(400, 'color must be set');
      set.color = body.color;
    }
    if ('sort_order' in body && Number.isInteger(body.sort_order)) set.sort_order = body.sort_order;
    if ('completed' in body) set.completed = body.completed ? 1 : 0;
    if ('skin' in body) set.skin = cleanSkin(body.skin);
    if ('claude_model' in body) set.claude_model = cleanModel(body.claude_model);
    if ('claude_effort' in body) set.claude_effort = cleanEffort(body.claude_effort);
    if ('repo_path' in body) set.repo_path = cleanRepoPath(body.repo_path);
    const keys = Object.keys(set);
    if (keys.length) {
      q(`UPDATE features SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), id);
    }
    return getFeature(id);
  }
  function deleteFeature(id) {
    q('DELETE FROM features WHERE id = ?').run(id);
  }

  // ---- files -------------------------------------------------------------
  function filesByTask() {
    const map = new Map();
    for (const r of q('SELECT id, task_id, kind, title, path FROM task_files ORDER BY created_at').all()) {
      if (!map.has(r.task_id)) map.set(r.task_id, []);
      map.get(r.task_id).push({ id: r.id, kind: r.kind, title: r.title, path: r.path, url: fileUrl(r.id) });
    }
    return map;
  }
  function filesFor(taskId) {
    return q('SELECT id, task_id, kind, path, title, created_at, stored_at FROM task_files WHERE task_id = ? ORDER BY created_at')
      .all(taskId).map((r) => ({ ...r, url: fileUrl(r.id) }));
  }
  function linkFile(taskId, body) {
    requireTask(taskId);
    const p = body?.path;
    if (!validFilePath(p)) throw new HttpError(400, 'path must be an absolute path to a .html or .htm file');
    let title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : path.basename(p.replace(/\\/g, '/'));
    title = title.slice(0, 200);
    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      throw new HttpError(404, `file not found: ${p}`);
    }
    if (stat.size > FILE_MAX_BYTES) throw new HttpError(413, 'file is over 10 MB');
    const content = fs.readFileSync(p);
    const ts = now();
    q(`INSERT INTO task_files (id, task_id, kind, path, title, created_at, content, stored_at)
       VALUES (?, ?, 'file', ?, ?, ?, ?, ?)
       ON CONFLICT(task_id, path) DO UPDATE SET title = excluded.title, content = excluded.content, stored_at = excluded.stored_at`)
      .run(genId('tf'), taskId, p, title, ts, content, ts);
    const row = q('SELECT id, task_id, kind, path, title, created_at, stored_at FROM task_files WHERE task_id = ? AND path = ?').get(taskId, p);
    return { ...row, url: fileUrl(row.id), markdown: `[${row.title}](${fileUrl(row.id)})` };
  }
  function deleteFile(fid) {
    q('DELETE FROM task_files WHERE id = ?').run(fid);
  }
  /** Stored bytes for a linked file, falling back to (and storing) the disk copy. */
  function fileContent(fid) {
    const row = q("SELECT id, path, content FROM task_files WHERE id = ? AND kind = 'file'").get(fid);
    if (!row) throw new HttpError(404, 'file not found');
    if (!validFilePath(row.path)) throw new HttpError(400, 'stored path is not an HTML file');
    if (row.content) return Buffer.from(row.content);
    try {
      const buf = fs.readFileSync(row.path);
      if (buf.length <= FILE_MAX_BYTES) q('UPDATE task_files SET content = ?, stored_at = ? WHERE id = ?').run(buf, now(), fid);
      return buf;
    } catch {
      throw new HttpError(404, `no stored copy, and the file is gone: ${row.path}`);
    }
  }

  // ---- meeting notes -------------------------------------------------------
  const NOTE_FIELDS = ['title', 'meeting_date', 'feature_id', 'body_html', 'transcript'];
  function cleanNoteFields(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'body must be an object');
    const out = {};
    for (const k of NOTE_FIELDS) {
      if (!(k in body)) continue;
      const v = body[k];
      if (k === 'feature_id') {
        if (v === null || v === '') out.feature_id = null;
        else if (typeof v !== 'string' || !getFeature(v)) throw new HttpError(400, 'feature_id must be a feature id or null');
        else out.feature_id = v;
      } else if (k === 'meeting_date') {
        if (!isRealDate(v)) throw new HttpError(400, 'meeting_date must be a real YYYY-MM-DD date');
        out.meeting_date = v;
      } else {
        if (typeof v !== 'string') throw new HttpError(400, `${k} must be text`);
        out[k] = k === 'title' ? v.trim().slice(0, 300) : v;
      }
    }
    if ('body_html' in out) out.body_text = noteText(out.body_html);
    return out;
  }
  function getNote(id) {
    const n = q('SELECT * FROM notes WHERE id = ?').get(id);
    if (!n) throw new HttpError(404, 'note not found');
    const feature = n.feature_id ? getFeature(n.feature_id) : null;
    return { ...n, feature_name: feature?.name ?? null, actions: countActions(n.body_html) };
  }
  function listNotes(query = {}) {
    const pick = (k) => (typeof query[k] === 'string' && query[k] ? query[k] : undefined);
    return searchNotes(q('SELECT * FROM notes').all(), {
      q: pick('q'), from: pick('from'), to: pick('to'), feature: pick('feature'), today: localDate(),
    });
  }
  function createNote(body) {
    const f = cleanNoteFields(body ?? {});
    const id = genId('n');
    const ts = now();
    q(`INSERT INTO notes (id, title, meeting_date, feature_id, body_html, body_text, transcript, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, f.title || 'Untitled meeting', f.meeting_date ?? localDate(), f.feature_id ?? null,
      f.body_html ?? '', f.body_text ?? '', f.transcript ?? '', ts, ts,
    );
    return getNote(id);
  }
  function updateNote(id, body) {
    getNote(id);
    const f = cleanNoteFields(body);
    if ('title' in f && !f.title) f.title = 'Untitled meeting';
    const cols = Object.keys(f);
    if (cols.length) {
      q(`UPDATE notes SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map((k) => f[k]), now(), id);
    }
    return getNote(id);
  }
  function deleteNote(id) {
    q('DELETE FROM notes WHERE id = ?').run(id);
  }

  // ---- images ------------------------------------------------------------
  function saveImage(buf) {
    if (!buf?.length) throw new HttpError(400, 'image body is empty');
    if (buf.length > IMAGE_MAX_BYTES) throw new HttpError(413, 'image is over 5 MB');
    const mime = sniffImage(buf);
    if (!mime) throw new HttpError(400, 'not a PNG, JPEG, GIF or WebP image');
    const id = genId('img');
    q('INSERT INTO images (id, mime, bytes, created_at) VALUES (?, ?, ?, ?)').run(id, mime, buf, now());
    return { id, url: imageUrl(id), mime };
  }
  function imageContent(id) {
    const row = q('SELECT mime, bytes FROM images WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'image not found');
    return { mime: row.mime, bytes: Buffer.from(row.bytes) };
  }
  /** Pictures in the task's description, in order; unknown ids are skipped. */
  function taskImages(taskId) {
    const t = requireTask(taskId);
    const get = q('SELECT id, mime FROM images WHERE id = ?');
    return imageIds(t.desc_html).map((id) => get.get(id)).filter(Boolean).map((r) => ({ id: r.id, mime: r.mime, url: imageUrl(r.id) }));
  }
  /** Store a local picture a session made for its report. */
  function uploadReportImage(taskId, body) {
    requireTask(taskId);
    const p = body?.path;
    if (typeof p !== 'string' || !ABS_PATH.test(p) || !IMAGE_EXT.test(p)) {
      throw new HttpError(400, 'path must be an absolute path to a .png, .jpg, .gif or .webp file');
    }
    let stat;
    try {
      stat = fs.statSync(p);
    } catch {
      throw new HttpError(404, `file not found: ${p}`);
    }
    if (stat.size > IMAGE_MAX_BYTES) throw new HttpError(413, 'image is over 5 MB');
    const img = saveImage(fs.readFileSync(p));
    const caption = (typeof body.caption === 'string' && body.caption.trim() ? body.caption.trim() : path.basename(p))
      .replace(/[[\]\n]/g, ' ').slice(0, 200);
    return { ...img, markdown: `![${caption}](${img.url})` };
  }

  // ---- tasks -------------------------------------------------------------
  const getTaskRow = (id) => parseTask(q('SELECT * FROM tasks WHERE id = ?').get(id));
  function requireTask(id) {
    const t = getTaskRow(id);
    if (!t) throw new HttpError(404, 'task not found');
    return t;
  }
  function listTasks() {
    const files = filesByTask();
    return q('SELECT * FROM tasks ORDER BY sort_order').all().map((r) => ({ ...parseTask(r), files: files.get(r.id) ?? [] }));
  }
  function requireFeature(id) {
    if (!getFeature(id)) throw new HttpError(400, 'feature not found');
  }

  function createTask(t) {
    if (!t || typeof t.title !== 'string' || !t.title.trim() || !t.feature) throw new HttpError(400, 'title and feature required');
    const f = cleanTaskFields(t);
    requireFeature(f.feature);
    const status = f.status ?? 'backlog';
    const ts = now();
    const task = {
      id: genId('t'),
      title: f.title,
      feature: f.feature,
      priority: f.priority ?? 3,
      est: f.est ?? cleanDefaultEst(getSettings().default_est),
      due: f.due ?? null,
      status,
      desc: f.desc ?? '',
      desc_html: f.desc_html ?? '',
      subtasks: f.subtasks ?? [],
      sort_order: q('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM tasks').get().n,
      created_at: ts,
      started_at: IN_PROGRESS.has(status) ? ts : null,
      completed_at: status === 'done' ? ts : null,
      claude_model: f.claude_model ?? null,
      claude_effort: f.claude_effort ?? null,
      repo_path: f.repo_path ?? null,
    };
    q(`INSERT INTO tasks (id, title, feature, priority, est, due, status, "desc", desc_html, subtasks, sort_order,
        created_at, started_at, completed_at, claude_model, claude_effort, repo_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      task.id, task.title, task.feature, task.priority, task.est, task.due, task.status, task.desc, task.desc_html,
      JSON.stringify(task.subtasks), task.sort_order, task.created_at, task.started_at, task.completed_at,
      task.claude_model, task.claude_effort, task.repo_path,
    );
    const row = getTaskRow(task.id);
    logStatus(row, null);
    return row;
  }

  function updateTask(id, fields) {
    if (!fields || typeof fields !== 'object') throw new HttpError(400, 'body must be an object');
    const cur = requireTask(id);
    const next = cleanTaskFields(fields);
    if (next.feature) requireFeature(next.feature);
    const ts = now();
    const from = cur.status;
    const to = next.status ?? from;

    if (to === 'done' && from !== 'done') next.completed_at = ts;
    if (to !== 'done') next.completed_at = null;
    if (IN_PROGRESS.has(to) && !cur.started_at) next.started_at = ts;
    Object.assign(next, agentFieldsOnMove(from, to));

    // Manual agent patch, applied after the move reset so a save that moves
    // the card in and also sets a state keeps that state.
    if ('agent_state' in fields || 'agent_note' in fields) {
      const moved = { state: next.agent_state !== undefined ? next.agent_state : cur.agent_state,
                      note: next.agent_note !== undefined ? next.agent_note : cur.agent_note };
      let state = moved.state;
      if ('agent_state' in fields) {
        state = fields.agent_state === '' ? null : fields.agent_state ?? null;
        if (state !== null && !AGENT_STATES.includes(state)) throw new HttpError(400, `agent_state must be null or one of ${AGENT_STATES.join(', ')}`);
      }
      const note = 'agent_note' in fields ? cleanNote(fields.agent_note) : moved.note;
      if (state !== moved.state || note !== moved.note) {
        next.agent_state = state;
        next.agent_note = note;
        next.agent_at = state ? ts : null;
      }
    }

    const cols = Object.keys(next);
    if (cols.length) {
      const val = (k) => (k === 'subtasks' ? JSON.stringify(next[k]) : next[k]);
      q(`UPDATE tasks SET ${cols.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`).run(...cols.map(val), id);
    }
    const row = getTaskRow(id);
    if (to !== from) logStatus(row, from);
    return row;
  }

  function deleteTask(id) {
    q('DELETE FROM tasks WHERE id = ?').run(id);
  }

  // ---- the Claude loop ------------------------------------------------------
  function setAgentStatus(id, body) {
    requireTask(id);
    const state = body?.state;
    if (!AGENT_STATES.includes(state)) throw new HttpError(400, `state must be one of ${AGENT_STATES.join(', ')}`);
    q('UPDATE tasks SET agent_state = ?, agent_note = ?, agent_at = ? WHERE id = ?').run(state, cleanNote(body.note), now(), id);
    const t = getTaskRow(id);
    return { id: t.id, title: t.title, status: t.status, agent_state: t.agent_state, agent_note: t.agent_note, agent_at: t.agent_at };
  }

  function setSubtask(id, body) {
    const t = requireTask(id);
    const n = body?.n;
    const done = body?.done ?? true;
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'n must be a whole number from 1');
    if (!t.subtasks.length) throw new HttpError(400, 'this task has no subtasks');
    if (n > t.subtasks.length) {
      const N = t.subtasks.length;
      throw new HttpError(400, `n must be 1 to ${N}; this task has ${N} subtask(s)`);
    }
    if (typeof done !== 'boolean') throw new HttpError(400, 'done must be true or false');
    const subtasks = t.subtasks.map((s, i) => (i === n - 1 ? { ...s, done } : s));
    q('UPDATE tasks SET subtasks = ? WHERE id = ?').run(JSON.stringify(subtasks), id);
    return { id: t.id, title: t.title, subtask: { n, t: subtasks[n - 1].t, done }, subtasks };
  }

  function setReport(id, body) {
    requireTask(id);
    const md = body?.markdown;
    if (typeof md !== 'string') throw new HttpError(400, 'markdown must be text');
    if (md.length > REPORT_MAX) throw new HttpError(400, `markdown must be at most ${REPORT_MAX} characters`);
    const clean = md.replace(/\r\n/g, '\n').trim();
    q('UPDATE tasks SET agent_report = ? WHERE id = ?').run(clean, id);
    return { id, agent_report: clean };
  }

  /** What a Claude session reads: everything but desc_html, plus how to report. */
  function agentView(id) {
    const t = requireTask(id);
    const feature = getFeature(t.feature);
    const { desc_html: _omit, ...rest } = t;
    const title = sessionTitle(t, feature?.name);
    const setup = claudeSetup(t, feature);
    const settings = getSettings();
    return {
      ...rest,
      feature_name: feature?.name ?? null,
      user_name: settings.user_name?.trim() || null,
      files: filesFor(id),
      session_title: title,
      claude_setup: setup,
      setup_label: setupLabel(setup),
      repo_path: resolveRepo(t, feature),
      task_repo_path: t.repo_path ?? null,
      claude_prompt: claudePrompt(t, cliPath, feature?.name),
      how_to_report: agentRules({ cli: `node "${cliPath}"`, id, title }),
    };
  }

  function agentStatus() {
    const files = filesByTask();
    const features = new Map(listFeatures().map((f) => [f.id, f.name]));
    const tasks = q("SELECT * FROM tasks WHERE status = 'claude' OR agent_state IS NOT NULL").all().map((r) => {
      const t = parseTask(r);
      return {
        id: t.id, title: t.title, feature_name: features.get(t.feature) ?? null, status: t.status,
        agent_state: t.agent_state, agent_note: t.agent_note, agent_at: t.agent_at, agent_report: t.agent_report,
        subtasks: t.subtasks, files: files.get(t.id) ?? [],
      };
    });
    return { cli: cliPath, tasks };
  }

  // ---- templates -----------------------------------------------------------
  const parseTemplate = (r) => r && { ...r, fields: JSON.parse(r.fields || '{}') };
  function listTemplates() {
    return q('SELECT * FROM task_templates ORDER BY name').all().map(parseTemplate);
  }
  function checkTemplate(body, partial) {
    const { value, error } = validateTemplate(body, { partial });
    if (error) throw new HttpError(400, error);
    if (value.fields?.feature) requireFeature(value.fields.feature);
    return value;
  }
  function createTemplate(body) {
    const v = checkTemplate(body, false);
    const id = genId('tt');
    const ts = now();
    q('INSERT INTO task_templates (id, name, fields, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, v.name, JSON.stringify(v.fields), ts, ts);
    return parseTemplate(q('SELECT * FROM task_templates WHERE id = ?').get(id));
  }
  function updateTemplate(id, body) {
    if (!q('SELECT id FROM task_templates WHERE id = ?').get(id)) throw new HttpError(404, 'template not found');
    const v = checkTemplate(body, true);
    if (v.name !== undefined) q('UPDATE task_templates SET name = ? WHERE id = ?').run(v.name, id);
    if (v.fields !== undefined) q('UPDATE task_templates SET fields = ? WHERE id = ?').run(JSON.stringify(v.fields), id);
    q('UPDATE task_templates SET updated_at = ? WHERE id = ?').run(now(), id);
    return parseTemplate(q('SELECT * FROM task_templates WHERE id = ?').get(id));
  }
  function templateUsed(id) {
    if (!q('SELECT id FROM task_templates WHERE id = ?').get(id)) throw new HttpError(404, 'template not found');
    const ts = now();
    q('UPDATE task_templates SET last_used_at = ? WHERE id = ?').run(ts, id);
    return { id, last_used_at: ts };
  }
  function deleteTemplate(id) {
    q('DELETE FROM task_templates WHERE id = ?').run(id);
  }

  function getState() {
    return { features: listFeatures(), tasks: listTasks(), settings: getSettings(), templates: listTemplates() };
  }

  return {
    db, getSettings, patchSettings, logActivity, activity,
    listFeatures, getFeature, createFeature, updateFeature, deleteFeature,
    listTasks, getTaskRow, createTask, updateTask, deleteTask,
    filesFor, linkFile, deleteFile, fileContent,
    saveImage, imageContent, taskImages, uploadReportImage,
    listNotes, getNote, createNote, updateNote, deleteNote,
    setAgentStatus, setSubtask, setReport, agentView, agentStatus,
    listTemplates, createTemplate, updateTemplate, templateUsed, deleteTemplate,
    getState,
  };
}
