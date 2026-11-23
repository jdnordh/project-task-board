import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startApi } from './helpers.js';

// Drives the real grove-agent MCP server against an in-memory API.
let t;
let client;
before(async () => {
  t = await startApi();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../mcp/agent-server.js', import.meta.url))],
    env: { ...process.env, GROVE_API_PORT: new URL(t.base).port },
  });
  client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
});
after(async () => {
  await client.close();
  t.close();
});

async function run(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content[0].text, error: !!r.isError };
}

test('projects: create, read, rename, complete, move and delete through the MCP', async () => {
  const made = await run('create_project', { name: 'Docs', repo_path: 'C:/src/docs', claude_model: 'sonnet' });
  assert.equal(made.error, false, made.text);
  assert.match(made.text, /^Created project p-\w+ · Docs \(#/);
  assert.match((await run('list_projects')).text, /Docs \(0 open of 0 tasks\) · repo C:\/src\/docs/);

  assert.equal((await run('update_project', { project: 'docs', name: 'Handbook', completed: true, position: 1 })).error, false);
  const { projects } = t.store.getState();
  assert.equal(projects[0].name, 'Handbook');
  assert.equal(projects[0].completed, true);
  assert.doesNotMatch((await run('list_projects', { include_completed: false })).text, /Handbook/);

  const info = (await run('get_project', { project: 'Handbook' })).text;
  assert.match(info, /Claude model · effort: sonnet/);
  assert.match(info, /Repo folder: C:\/src\/docs/);

  const wrong = await run('delete_project', { project: 'Handbook', confirm_name: 'handbook' });
  assert.equal(wrong.error, true);
  assert.ok(t.store.listProjects().some((p) => p.name === 'Handbook'));
  assert.match((await run('delete_project', { project: 'Handbook', confirm_name: 'Handbook' })).text, /Deleted project Handbook and its 0 task/);
  assert.ok(!t.store.listProjects().some((p) => p.name === 'Handbook'));
});

test('tasks: create in any column, update every field, list with filters, delete', async () => {
  await run('create_project', { name: 'Core' });
  const made = await run('create_task', { title: 'Ship', project: 'core', status: 'progress', subtasks: ['a', '[x] b'], due: '2026-12-01' });
  assert.equal(made.error, false, made.text);
  const id = made.text.match(/^Created (\S+)/)[1];
  let task = t.store.getTaskRow(id);
  assert.equal(task.status, 'progress');
  assert.ok(task.started_at);
  assert.deepEqual(task.subtasks, [{ t: 'a', done: false }, { t: 'b', done: true }]);

  await run('create_project', { name: 'Site' });
  const up = await run('update_task', {
    task_id: id, title: 'Ship it', project: 'Site', priority: 1, est: 3, due: null, desc: 'Line one', status: 'done',
    claude_effort: 'high', repo_path: 'C:/src/site',
  });
  assert.equal(up.error, false, up.text);
  task = t.store.getTaskRow(id);
  assert.equal(task.title, 'Ship it');
  assert.equal(t.store.getProject(task.project).name, 'Site');
  assert.deepEqual([task.priority, task.est, task.due, task.desc, task.status, task.claude_effort, task.repo_path],
    [1, 3, null, 'Line one', 'done', 'high', 'C:/src/site']);
  assert.ok(task.completed_at);

  assert.match((await run('list_tasks', { status: ['done'], project: 'site', q: 'ship' })).text, /Site: Ship it · done/);
  assert.equal((await run('list_tasks', { project: 'Core' })).text, 'No tasks match.');
  assert.match((await run('get_task', { task_id: id })).text, /^\S+ — Ship it\nProject: Site/);

  const bad = await run('update_task', { task_id: id, status: 'nowhere' });
  assert.equal(bad.error, true);
  assert.equal((await run('update_task', { task_id: 'nope', title: 'x' })).error, true);

  assert.match((await run('delete_task', { task_id: id })).text, /^Deleted .* Site: Ship it$/);
  assert.equal(t.store.getTaskRow(id), undefined);
});
