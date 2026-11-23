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
import { cleanDefaultEst } from '../src/lib/constants.js';
import { sortClaude } from '../src/lib/buddy.js';
import { claudeLine } from './format.js';
import { call, getBytes, tool, taskId, registerNoteTools } from './client.js';
import { registerBoardTools } from './board-tools.js';

const FILE_TEXT_MAX = 60000;
const enc = encodeURIComponent;

const server = new McpServer(
  { name: 'grove-buddy', version: '1.1.0' },
  {
    instructions: 'Tools for the Buddy orchestrator on the Grove board: read and change projects and tasks, read meeting notes, '
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

registerBoardTools(server);
registerNoteTools(server);

server.registerTool('delegate_task', {
  description: 'Move a task to the Claude column (same as a drag; clears the old worker status, keeps report and files). '
    + 'Returns the worker prompt (use it unchanged), the session title, the model · effort hint and the repo folder.',
  inputSchema: { task_id: taskId },
}, tool(async ({ task_id }) => {
  const d = await call('POST', `/api/tasks/${enc(task_id)}/delegate`);
  const lines = [
    `Delegated ${d.project_name}: ${d.title}`,
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
