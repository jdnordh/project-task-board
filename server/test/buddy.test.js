import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sortClaude } from '../src/lib/buddy.js';
import { projectLine, taskLine, noteLine, formatNote, claudeLine } from '../mcp/format.js';
import { startApi } from './helpers.js';

const PROJECTS = [{ id: 'f-1', name: 'Core', completed: false }, { id: 'f-2', name: 'Site', completed: false }];

test('sortClaude: question, review, complete, running, waiting', () => {
  const s = sortClaude([
    { id: 'w', agent_state: null }, { id: 'r', agent_state: 'running' }, { id: 'q', agent_state: 'question' },
    { id: 'c', agent_state: 'complete' }, { id: 'v', agent_state: 'review' },
  ]);
  assert.deepEqual(s.map((x) => x.id), ['q', 'v', 'c', 'r', 'w']);
});

test('text lines for projects, tasks, notes and claude cards', () => {
  assert.equal(projectLine({ id: 'f-1', name: 'Core', completed: false, repo_path: 'C:/src/core' }, { open: 2, total: 5 }),
    'f-1 Core (2 open of 5 tasks) · repo C:/src/core');
  assert.equal(projectLine({ id: 'f-2', name: 'Old', completed: true }, { open: 0, total: 1 }), 'f-2 Old [completed] (0 open of 1 tasks)');
  assert.equal(taskLine({ id: 't1', title: 'Fix', status: 'week', priority: 2, est: 1, due: '2026-10-30', agent_state: null }, 'Core'),
    't1 · Core: Fix · week · P2 · 1h · due 2026-10-30');
  assert.equal(noteLine({ id: 'n1', meeting_date: '2026-10-20', title: 'Weekly', actions: { open: 1, total: 3 }, excerpt: 'hello' }, 'Core'),
    'n1 · 2026-10-20 · Weekly [Core] (1/3 action items open)\n    hello');
  const note = formatNote({ id: 'n1', title: 'Weekly', meeting_date: '2026-10-20', project_name: null, body_text: '[ ] a', transcript: 'Sam: hi' });
  assert.match(note, /^Weekly\nDate: 2026-10-20\nProject: none\nId: n1\n\n\[ \] a\n\n--- Transcript ---\nSam: hi$/);
  const now = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(claudeLine({
    id: 't2', title: 'Do', project_name: 'Core', agent_state: 'question', agent_note: 'Which DB?', agent_at: '2026-10-28T11:00:00Z',
    agent_report: '', subtasks: [{ t: 'a', done: true }, { t: 'b', done: false }], files: [{ id: 'tf1' }],
  }, now), 't2 · Core: Do · question — Which DB? · 1h ago · report no · subtasks 1/2 · files tf1');
});

let t;
before(async () => { t = await startApi(); });
after(() => t.close());

test('POST /api/tasks/:id/delegate moves the card to claude and returns the prompt and folder', async () => {
  const f = await t.project('Delegate F');
  await t.api('PATCH', `/api/projects/${f.id}`, { repo_path: 'C:/src/app', claude_model: 'sonnet' });
  const task = (await t.api('POST', '/api/tasks', { title: 'Write the docs', project: f.id })).body;
  await t.api('POST', `/api/tasks/${task.id}/agent`, { state: 'complete', note: 'old' });
  const d = await t.api('POST', `/api/tasks/${task.id}/delegate`);
  assert.equal(d.status, 200);
  assert.match(d.body.prompt, /^Please work on my Grove task /);
  assert.equal(d.body.session_title, 'Delegate F: Write docs');
  assert.equal(d.body.repo_path, 'C:/src/app');
  assert.equal(d.body.model, 'sonnet');
  assert.equal(d.body.setup_label, 'Sonnet');
  const after = (await t.api('GET', `/api/tasks/${task.id}`)).body;
  assert.equal(after.status, 'claude');
  assert.equal(after.agent_state, null);
  assert.equal((await t.api('POST', '/api/tasks/nope/delegate')).status, 404);
});
