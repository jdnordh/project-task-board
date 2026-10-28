#!/usr/bin/env node
/**
 * agent-server.js — the `grove-agent` MCP server (stdio).
 *
 * Lets a Claude Code session in any folder read a Grove task and keep its
 * card current. It goes through the REST API, never SQLite, so there is one
 * writer and one set of validation. `.env` is re-read on every call.
 *
 * Register once, at user scope:
 *   claude mcp add --scope user grove-agent -- node <repo>/server/mcp/agent-server.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { REPO_ROOT, readEnv } from '../src/env.js';
import { agentRules } from '../src/lib/agent.js';
import { AGENT_STATES } from '../src/lib/constants.js';
import { formatTask } from './format-task.js';

const REPO = REPO_ROOT.replace(/\\/g, '/');

class Unreachable extends Error {}

async function call(method, url, body, { bearer = false } = {}) {
  const env = readEnv();
  const port = Number(env.PORT) || 3004;
  const headers = { 'Content-Type': 'application/json' };
  if (bearer && env.GROVE_TOKEN) headers.Authorization = `Bearer ${env.GROVE_TOKEN}`;
  let res;
  try {
    res = await fetch(`http://localhost:${port}${url}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Unreachable(`Grove is not running at localhost:${port}. Ask the user to start it (npm run dev in ${REPO}).`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const text = (s) => ({ content: [{ type: 'text', text: s }] });

/** Run a tool body; turn failures into a readable tool error. */
const tool = (fn) => async (args) => {
  try {
    return text(await fn(args));
  } catch (err) {
    return { ...text(err.message), isError: true };
  }
};

const server = new McpServer(
  { name: 'grove-agent', version: '1.0.0' },
  { instructions: 'For a Grove task id the user gives you, call get_task first.\n' + agentRules().join('\n') },
);

const taskId = z.string().min(1).describe('The Grove task id, e.g. tmh2k3x1');

server.registerTool('get_task', {
  description: 'Read a Grove task: title, description, subtasks, your last status, linked files, report, and how to report.',
  inputSchema: { task_id: taskId },
}, tool(async ({ task_id }) => formatTask(await call('GET', `/api/tasks/${encodeURIComponent(task_id)}`))));

server.registerTool('set_task_status', {
  description: 'Set your status on the task card (running, question, review, complete) with a short note.',
  inputSchema: {
    task_id: taskId,
    state: z.enum(AGENT_STATES),
    note: z.string().max(560).optional().describe('Under 280 characters; longer notes are cut.'),
  },
}, tool(async ({ task_id, state, note }) => {
  const r = await call('POST', `/api/tasks/${encodeURIComponent(task_id)}/agent`, { state, note: note ?? '' });
  return `Status on "${r.title}" is now ${r.agent_state}${r.agent_note ? ` — ${r.agent_note}` : ''}`;
}));

server.registerTool('check_subtask', {
  description: 'Tick (or untick) a subtask by its number from get_task.',
  inputSchema: { task_id: taskId, n: z.number().int().min(1), done: z.boolean().optional() },
}, tool(async ({ task_id, n, done }) => {
  const r = await call('POST', `/api/tasks/${encodeURIComponent(task_id)}/subtask`, { n, done: done ?? true });
  const left = r.subtasks.filter((s) => !s.done).length;
  const verb = r.subtask.done ? 'Ticked' : 'Unticked';
  return `${verb} ${n}. ${r.subtask.t} — ${left ? `${left} of ${r.subtasks.length} left` : 'all subtasks done.'}`;
}));

server.registerTool('set_task_report', {
  description: 'Write the markdown report shown on the card. Each call replaces the last; an empty string clears it.',
  inputSchema: { task_id: taskId, markdown: z.string().max(50000) },
}, tool(async ({ task_id, markdown }) => {
  const r = await call('PUT', `/api/tasks/${encodeURIComponent(task_id)}/report`, { markdown });
  return r.agent_report ? `Report saved (${r.agent_report.length} characters).` : 'Report cleared.';
}));

server.registerTool('link_task_file', {
  description: 'Link a self-contained .html file you made to the task. Grove stores a copy. Returns a markdown link for your report.',
  inputSchema: {
    task_id: taskId,
    path: z.string().describe('Absolute path to the .html file'),
    title: z.string().max(200).optional(),
  },
}, tool(async ({ task_id, path, title }) => {
  const r = await call('POST', `/api/tasks/${encodeURIComponent(task_id)}/files`, { path, title }, { bearer: true });
  return `Linked. Put this in your report: ${r.markdown}`;
}));

await server.connect(new StdioServerTransport());
