import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function toolsOf(file) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL(`../mcp/${file}`, import.meta.url))] });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return Object.fromEntries(tools.map((t) => [t.name, t]));
  } finally {
    await client.close();
  }
}

const BOARD = ['list_projects', 'get_project', 'create_project', 'update_project', 'delete_project',
  'list_tasks', 'get_task', 'create_task', 'update_task', 'delete_task'];

test('grove-agent lists the board, worker, image and note tools', async () => {
  const tools = await toolsOf('agent-server.js');
  for (const n of [...BOARD, 'set_task_status', 'check_subtask', 'set_task_report', 'link_task_file',
    'get_task_images', 'upload_report_image', 'search_meeting_notes', 'get_meeting_note']) assert.ok(tools[n], n);
});

test('grove-buddy lists the board and Buddy tools; write tools refuse unknown fields', async () => {
  const tools = await toolsOf('buddy-server.js');
  for (const n of [...BOARD, 'get_profile', 'search_meeting_notes', 'get_meeting_note', 'delegate_task', 'list_claude_tasks', 'read_task_file']) assert.ok(tools[n], n);
  for (const n of ['create_task', 'update_task', 'create_project', 'update_project']) {
    assert.equal(tools[n].inputSchema.additionalProperties, false, n);
  }
});
