import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTask } from '../mcp/format-task.js';

test('get_task text lists subtasks by number and ends with the rules', () => {
  const out = formatTask({
    id: 't1', title: 'Do it', feature_name: 'Core', session_title: 'Core: Do it', user_name: 'Sam', setup_label: '',
    status: 'claude', priority: 2, est: 1.5, due: null, desc: 'plain', subtasks: [{ t: 'a', done: true }, { t: 'b', done: false }],
    agent_state: null, agent_note: '', files: [], agent_report: '',
  }).split('\n');
  assert.equal(out[0], 't1 — Do it');
  assert.ok(out.includes("User's name: Sam"));
  assert.ok(out.includes('Status: claude · Priority P2 (1 is most urgent) · Estimate 1h 30m · Due no date'));
  assert.ok(out.includes('1. [x] a'));
  assert.ok(out.includes('2. [ ] b'));
  assert.ok(out.includes('Your status: not reported yet'));
  assert.ok(out.includes('How to report:'));
  assert.match(out.at(-1), /^The Grove server must be running/);
});
