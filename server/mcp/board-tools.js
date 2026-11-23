/**
 * board-tools.js — full read/write on the board's projects and tasks,
 * registered by both MCP servers (grove-agent and grove-buddy). REST only,
 * never SQLite. Input rules live in ../src/lib/board-edit.js.
 *
 * House rule (CLAUDE.md): every new app feature gets MCP tools here (or in a
 * sibling module) in the same change.
 */

import { z } from 'zod';
import { COLUMN_IDS, CLAUDE_MODELS, CLAUDE_EFFORTS } from '../src/lib/constants.js';
import { localDate } from '../src/lib/dates.js';
import { findProject } from '../src/lib/buddy.js';
import { checkTaskEdit, checkProjectEdit, reorderIds } from '../src/lib/board-edit.js';
import { formatTask } from './format-task.js';
import { projectLine, taskLine, formatProject } from './format.js';
import { call, tool, taskId } from './client.js';

const enc = encodeURIComponent;

const projectRef = z.string().min(1).describe('Project id or name (any case)');
const model = z.enum(CLAUDE_MODELS.map((m) => m.id)).nullable();
const effort = z.enum(CLAUDE_EFFORTS).nullable();
const subtaskList = z.array(z.union([z.string(), z.object({ t: z.string(), done: z.boolean().optional() })]));

const taskShape = {
  title: z.string().optional(),
  project: projectRef.optional(),
  priority: z.number().int().optional().describe('1–9, 1 most urgent'),
  est: z.number().optional().describe('Hours, more than 0 and at most 80'),
  due: z.string().nullable().optional().describe('YYYY-MM-DD; null clears it'),
  status: z.enum(COLUMN_IDS).optional(),
  desc: z.string().optional().describe('Plain-text description. Replaces the whole description, pictures included.'),
  subtasks: subtaskList.optional().describe('Replaces the whole list. Text items; "[x] text" makes a ticked one.'),
  claude_model: model.optional(),
  claude_effort: effort.optional(),
  repo_path: z.string().nullable().optional().describe('Absolute folder the worker runs in; null clears it'),
};

const projectShape = {
  name: z.string().optional(),
  color: z.string().optional().describe('Hex colour, e.g. #38E1FF. Left out on create: the next free palette colour.'),
  completed: z.boolean().optional(),
  position: z.number().int().min(1).optional().describe('1-based place in the project list'),
  skin: z.string().nullable().optional(),
  claude_model: model.optional(),
  claude_effort: effort.optional(),
  repo_path: z.string().nullable().optional().describe('Absolute default folder for this project\'s workers; null clears it'),
};

async function board() {
  return call('GET', '/api/state');
}

function needProject(ref, projects) {
  const p = findProject(ref, projects);
  if (!p) throw new Error(`Unknown project "${ref}". Projects: ${projects.map((x) => x.name).join(', ') || 'none'}`);
  return p;
}

async function moveProject(id, position) {
  const { projects } = await board();
  for (const { id: pid, sort_order } of reorderIds(projects, id, position)) {
    await call('PATCH', `/api/projects/${enc(pid)}`, { sort_order });
  }
}

function taskSummary(t, name) {
  return `${t.id} · ${name ?? '—'}: ${t.title} (${t.status}, P${t.priority}, ${t.est}h${t.due ? `, due ${t.due}` : ''})`;
}

/**
 * Register the project and task tools. `skip` names tools a server
 * registers its own way.
 */
export function registerBoardTools(server, { skip = [] } = {}) {
  const reg = (name, def, fn) => { if (!skip.includes(name)) server.registerTool(name, def, fn); };

  // ---- projects ------------------------------------------------------------
  reg('list_projects', {
    description: 'One line per project: id, name, [completed], open of total tasks, and its repo folder when set.',
    inputSchema: { include_completed: z.boolean().optional().describe('Default true') },
  }, tool(async ({ include_completed }) => {
    const { projects, tasks } = await board();
    const shown = include_completed === false ? projects.filter((p) => !p.completed) : projects;
    return shown.map((p) => {
      const mine = tasks.filter((t) => t.project === p.id);
      return projectLine(p, { open: mine.filter((t) => t.status !== 'done').length, total: mine.length });
    }).join('\n') || 'No projects.';
  }));

  reg('get_project', {
    description: 'One project in full: colour, skin, completed, repo folder, Claude model · effort defaults, and one line per task.',
    inputSchema: { project: projectRef, include_done: z.boolean().optional().describe('Also list done tasks (default false)') },
  }, tool(async ({ project, include_done }) => {
    const { projects, tasks } = await board();
    const p = needProject(project, projects);
    const mine = tasks.filter((t) => t.project === p.id && (include_done || t.status !== 'done'));
    return formatProject(p, mine, tasks.filter((t) => t.project === p.id).length);
  }));

  reg('create_project', {
    description: 'Make a project. Only name is needed; colour defaults to the next free palette colour.',
    inputSchema: z.object({ ...projectShape, name: z.string() }).strict(),
  }, tool(async (args) => {
    const { projects } = await board();
    const { value, error } = checkProjectEdit(args, projects, { create: true });
    if (error) throw new Error(error);
    const { position, ...body } = value;
    const p = await call('POST', '/api/projects', body);
    if (position) await moveProject(p.id, position);
    return `Created project ${p.id} · ${p.name} (${p.color})`;
  }));

  reg('update_project', {
    description: 'Change a project: rename, recolour, mark completed (or not), move in the list, set or clear its repo folder and Claude defaults.',
    inputSchema: z.object({ project: projectRef, ...projectShape }).strict(),
  }, tool(async ({ project, ...fields }) => {
    const { projects } = await board();
    const p = needProject(project, projects);
    const { value, error } = checkProjectEdit(fields, projects);
    if (error) throw new Error(error);
    const { position, ...body } = value;
    let out = p;
    if (Object.keys(body).length) out = await call('PATCH', `/api/projects/${enc(p.id)}`, body);
    if (position) await moveProject(p.id, position);
    return `Updated project ${out.id} · ${out.name}: ${Object.keys(value).join(', ')}`;
  }));

  reg('delete_project', {
    description: 'Delete a project AND every task in it. Cannot be undone. Meeting notes tagged with it keep their text and lose the tag. '
      + 'confirm_name must repeat the project\'s exact name. Prefer update_project completed=true to retire a project.',
    inputSchema: { project: projectRef, confirm_name: z.string() },
  }, tool(async ({ project, confirm_name }) => {
    const { projects, tasks } = await board();
    const p = needProject(project, projects);
    if (confirm_name !== p.name) throw new Error(`confirm_name must be exactly "${p.name}". Nothing was deleted.`);
    const n = tasks.filter((t) => t.project === p.id).length;
    await call('DELETE', `/api/projects/${enc(p.id)}`);
    return `Deleted project ${p.name} and its ${n} task(s).`;
  }));

  // ---- tasks ---------------------------------------------------------------
  reg('list_tasks', {
    description: 'One summary line per task with its project (no descriptions). Default: every status but done.',
    inputSchema: {
      status: z.array(z.enum(COLUMN_IDS)).optional(),
      project: projectRef.optional(),
      q: z.string().optional().describe('Every word must appear in the title or description'),
      overdue: z.boolean().optional().describe('Only open tasks whose due date is before today'),
      limit: z.number().int().min(1).max(500).optional(),
    },
  }, tool(async ({ status, project, q, overdue, limit }) => {
    const { projects, tasks } = await board();
    const names = new Map(projects.map((p) => [p.id, p.name]));
    const today = localDate();
    const want = new Set(status?.length ? status : COLUMN_IDS.filter((c) => c !== 'done'));
    let rows = tasks.filter((t) => want.has(t.status));
    if (project) {
      const p = needProject(project, projects);
      rows = rows.filter((t) => t.project === p.id);
    }
    if (q?.trim()) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      rows = rows.filter((t) => { const hay = `${t.title}\n${t.desc}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
    }
    if (overdue) rows = rows.filter((t) => t.status !== 'done' && t.due && t.due < today);
    rows.sort((a, b) => a.priority - b.priority || String(a.due ?? '9999').localeCompare(String(b.due ?? '9999')));
    const shown = rows.slice(0, limit ?? 100);
    const more = rows.length > shown.length ? `\n… and ${rows.length - shown.length} more` : '';
    return shown.length ? shown.map((t) => taskLine(t, names.get(t.project))).join('\n') + more : 'No tasks match.';
  }));

  reg('get_task', {
    description: 'Read a Grove task: title, project, description, subtasks, folder, worker status, linked files, report, and how to report.',
    inputSchema: { task_id: taskId },
  }, tool(async ({ task_id }) => formatTask(await call('GET', `/api/tasks/${enc(task_id)}`))));

  reg('create_task', {
    description: 'Make a task. project is an id or a name (any case). status: a board column (default backlog). '
      + 'priority 1–9, 1 most urgent (default 3). Leave est out to use the user default. due YYYY-MM-DD. subtasks: list of strings.',
    inputSchema: z.object({ ...taskShape, title: z.string(), project: projectRef }).strict(),
  }, tool(async (args) => {
    const { projects } = await board();
    const { value, error } = checkTaskEdit(args, projects, { create: true });
    if (error) throw new Error(error);
    const t = await call('POST', '/api/tasks', value);
    return `Created ${taskSummary(t, projects.find((p) => p.id === t.project)?.name)}`;
  }));

  reg('update_task', {
    description: 'Change any task field: title, project (move it), status (move column, same as a drag), priority, est, due, '
      + 'description, subtasks (replaces the list), Claude model · effort, repo folder. Only the fields you pass change.',
    inputSchema: z.object({ task_id: taskId, ...taskShape }).strict(),
  }, tool(async ({ task_id, ...fields }) => {
    const { projects } = await board();
    const { value, error } = checkTaskEdit(fields, projects);
    if (error) throw new Error(error);
    const t = await call('PATCH', `/api/tasks/${enc(task_id)}`, value);
    return `Updated ${taskSummary(t, projects.find((p) => p.id === t.project)?.name)}: ${Object.keys(value).join(', ')}`;
  }));

  reg('delete_task', {
    description: 'Delete a task, with its linked files. Cannot be undone; moving it to done is usually what the user wants.',
    inputSchema: { task_id: taskId },
  }, tool(async ({ task_id }) => {
    const t = await call('GET', `/api/tasks/${enc(task_id)}`);
    await call('DELETE', `/api/tasks/${enc(task_id)}`);
    return `Deleted ${t.id} · ${t.project_name ?? '—'}: ${t.title}`;
  }));
}
