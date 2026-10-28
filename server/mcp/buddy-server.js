#!/usr/bin/env node
/**
 * buddy-server.js — the `grove-buddy` MCP server (stdio): the tools the
 * Buddy orchestrator skill uses to read the board, make tasks and hand
 * them to worker sessions. Registered in this repo's .mcp.json only;
 * workers use `grove-agent`. REST only, never SQLite.
 */

import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { COLUMN_IDS, cleanDefaultEst } from '../src/lib/constants.js';
import { localDate } from '../src/lib/dates.js';
import { checkBuddyTask, sortClaude, BUDDY_STATUSES } from '../src/lib/buddy.js';
import { formatTask } from './format-task.js';
import { featureLine, taskLine, claudeLine } from './format.js';
import { call, getBytes, tool, taskId, registerNoteTools } from './client.js';

const FILE_TEXT_MAX = 60000;
const enc = encodeURIComponent;

const server = new McpServer(
  { name: 'grove-buddy', version: '1.0.0' },
  {
    instructions: 'Tools for the Buddy orchestrator on the Grove board: read the board and meeting notes, create tasks, '
      + 'delegate them to worker sessions and pull their results. Load the `buddy` skill before using them. '
      + 'Workers report with the grove-agent tools, not these.',
  },
);

server.registerTool('get_profile', {
  description: "The user's name and default task estimate.",
  inputSchema: {},
}, tool(async () => {
  const { settings } = await call('GET', '/api/state');
  return `User's name: ${settings.user_name?.trim() || '(not set)'}\nDefault estimate: ${cleanDefaultEst(settings.default_est)}h`;
}));

server.registerTool('list_features', {
  description: 'One line per feature: id, name, [completed], open of total tasks, and its repo folder when set.',
  inputSchema: {},
}, tool(async () => {
  const { features, tasks } = await call('GET', '/api/state');
  return features.map((f) => {
    const mine = tasks.filter((t) => t.feature === f.id);
    return featureLine(f, { open: mine.filter((t) => t.status !== 'done').length, total: mine.length });
  }).join('\n') || 'No features.';
}));

server.registerTool('list_tasks', {
  description: 'One summary line per task with its feature (no descriptions). Default: every status but done.',
  inputSchema: {
    status: z.array(z.enum(COLUMN_IDS)).optional(),
    overdue: z.boolean().optional().describe('Only open tasks whose due date is before today'),
    limit: z.number().int().min(1).max(500).optional(),
  },
}, tool(async ({ status, overdue, limit }) => {
  const { features, tasks } = await call('GET', '/api/state');
  const names = new Map(features.map((f) => [f.id, f.name]));
  const today = localDate();
  const want = new Set(status?.length ? status : COLUMN_IDS.filter((c) => c !== 'done'));
  let rows = tasks.filter((t) => want.has(t.status));
  if (overdue) rows = rows.filter((t) => t.status !== 'done' && t.due && t.due < today);
  rows.sort((a, b) => a.priority - b.priority || String(a.due ?? '9999').localeCompare(String(b.due ?? '9999')));
  const shown = rows.slice(0, limit ?? 100);
  const more = rows.length > shown.length ? `\n… and ${rows.length - shown.length} more` : '';
  return shown.length ? shown.map((t) => taskLine(t, names.get(t.feature))).join('\n') + more : 'No tasks match.';
}));

server.registerTool('get_task', {
  description: 'The full task in plain text: description, subtasks, folder, worker status, report and linked files.',
  inputSchema: { task_id: taskId },
}, tool(async ({ task_id }) => formatTask(await call('GET', `/api/tasks/${enc(task_id)}`))));

registerNoteTools(server);

server.registerTool('create_task', {
  description: `Make a task. feature is an id or a name (any case). status: ${BUDDY_STATUSES.join(' or ')} (default backlog). `
    + 'priority 1–9, 1 most urgent (default 3). Leave est out to use the user default. due YYYY-MM-DD. subtasks: list of strings.',
  inputSchema: z.object({
    title: z.string(),
    feature: z.string(),
    priority: z.number().int().optional(),
    est: z.number().optional(),
    due: z.string().optional(),
    status: z.string().optional(),
    desc: z.string().optional(),
    subtasks: z.array(z.string()).optional(),
  }).strict(),
}, tool(async (args) => {
  const { features } = await call('GET', '/api/state');
  const { value, error } = checkBuddyTask(args, features);
  if (error) throw new Error(error);
  const t = await call('POST', '/api/tasks', value);
  const name = features.find((f) => f.id === t.feature)?.name;
  return `Created ${t.id} · ${name}: ${t.title} (${t.status}, P${t.priority}, ${t.est}h${t.due ? `, due ${t.due}` : ''})`;
}));

server.registerTool('delegate_task', {
  description: 'Move a task to the Claude column (same as a drag; clears the old worker status, keeps report and files). '
    + 'Returns the worker prompt (use it unchanged), the session title, the model · effort hint and the repo folder.',
  inputSchema: { task_id: taskId },
}, tool(async ({ task_id }) => {
  const d = await call('POST', `/api/tasks/${enc(task_id)}/delegate`);
  const lines = [
    `Delegated ${d.feature_name}: ${d.title}`,
    `Session title: ${d.session_title}`,
    `Model · effort: ${d.setup_label || 'not set (use your own)'}${d.model ? ` [model=${d.model}]` : ''}${d.effort ? ` [effort=${d.effort}]` : ''}`,
    `Folder: ${d.repo_path ?? 'not set — ask the user where the worker should run'}`,
  ];
  if (d.had_report || d.file_ids.length) lines.push(`Note: this task keeps its earlier report${d.file_ids.length ? ` and files (${d.file_ids.join(', ')})` : ''}.`);
  lines.push('', 'Prompt:', d.prompt);
  return lines.join('\n');
}));

server.registerTool('list_claude_tasks', {
  description: 'One line per card in the Claude column, what needs the user first: question, review, complete, running, waiting. '
    + 'Shows age, report yes/no, ticked subtasks and file ids. all: also cards that left the column but still have a worker status.',
  inputSchema: { all: z.boolean().optional() },
}, tool(async ({ all }) => {
  const { tasks } = await call('GET', '/api/agent-status');
  const rows = sortClaude(all ? tasks : tasks.filter((t) => t.status === 'claude'));
  const now = Date.now();
  return rows.length ? rows.map((t) => claudeLine(t, now) + (t.status !== 'claude' ? ` · now in ${t.status}` : '')).join('\n') : 'The Claude column is empty.';
}));

server.registerTool('read_task_file', {
  description: `Read a linked HTML file by its file id: its text (cut at ${FILE_TEXT_MAX} characters), or with save_to, write the whole file there.`,
  inputSchema: { file_id: z.string().min(1), save_to: z.string().optional().describe('Absolute path of the .html file to write') },
}, tool(async ({ file_id, save_to }) => {
  const buf = await getBytes(`/api/task-files/${enc(file_id)}`);
  if (save_to) {
    const out = path.resolve(save_to);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    return `Saved ${buf.length} bytes to ${out}`;
  }
  const s = buf.toString('utf8');
  return s.length > FILE_TEXT_MAX ? `${s.slice(0, FILE_TEXT_MAX)}\n… (cut at ${FILE_TEXT_MAX} of ${s.length} characters; use save_to for the whole file)` : s;
}));

await server.connect(new StdioServerTransport());
