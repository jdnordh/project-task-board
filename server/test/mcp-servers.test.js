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

test('grove-agent lists the worker, image and note tools', async () => {
  const tools = await toolsOf('agent-server.js');
  for (const n of ['get_task', 'set_task_status', 'check_subtask', 'set_task_report', 'link_task_file',
    'get_task_images', 'upload_report_image', 'search_meeting_notes', 'get_meeting_note']) assert.ok(tools[n], n);
});

test('grove-buddy lists the read and Buddy tools; create_task refuses unknown fields', async () => {
  const tools = await toolsOf('buddy-server.js');
  for (const n of ['get_profile', 'list_features', 'list_tasks', 'get_task', 'search_meeting_notes', 'get_meeting_note',
    'create_task', 'delegate_task', 'list_claude_tasks', 'read_task_file']) assert.ok(tools[n], n);
  assert.equal(tools.create_task.inputSchema.additionalProperties, false);
});
