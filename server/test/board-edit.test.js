import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTaskEdit, checkProjectEdit, nextProjectColor, toSubtasks, reorderIds } from '../src/lib/board-edit.js';
import { PROJECT_PALETTE } from '../src/lib/constants.js';

const PROJECTS = [{ id: 'p-1', name: 'Core', color: PROJECT_PALETTE[0].hex }, { id: 'p-2', name: 'Site', color: '#123456' }];

test('checkTaskEdit (create) resolves a project by id or any-case name and needs a title', () => {
  assert.equal(checkTaskEdit({ title: 'x', project: 'core' }, PROJECTS, { create: true }).value.project, 'p-1');
  assert.equal(checkTaskEdit({ title: 'x', project: 'p-2' }, PROJECTS, { create: true }).value.project, 'p-2');
  const { value } = checkTaskEdit({ title: ' x ', project: 'Core', subtasks: ['a', '[x] b'] }, PROJECTS, { create: true });
  assert.deepEqual(value, { title: 'x', project: 'p-1', subtasks: [{ t: 'a', done: false }, { t: 'b', done: true }] });
  assert.match(checkTaskEdit({ project: 'Core' }, PROJECTS, { create: true }).error, /title/);
  assert.match(checkTaskEdit({ title: 'x' }, PROJECTS, { create: true }).error, /Unknown project/);
});

test('checkTaskEdit (update) takes only the fields given and lets any column in', () => {
  assert.deepEqual(checkTaskEdit({ status: 'progress' }, PROJECTS).value, { status: 'progress' });
  assert.deepEqual(checkTaskEdit({ due: null, repo_path: '', claude_model: null }, PROJECTS).value,
    { due: null, repo_path: null, claude_model: null });
  assert.deepEqual(checkTaskEdit({ project: 'site', priority: 1, est: 2.5 }, PROJECTS).value, { project: 'p-2', priority: 1, est: 2.5 });
  assert.match(checkTaskEdit({}, PROJECTS).error, /Nothing to change/);
});

test('checkTaskEdit refuses unknown fields, projects, columns, dates and setups', () => {
  assert.match(checkTaskEdit({ foo: 1 }, PROJECTS).error, /foo/);
  assert.match(checkTaskEdit({ project: 'Nope' }, PROJECTS).error, /Unknown project "Nope"\. Projects: Core, Site/);
  assert.match(checkTaskEdit({ status: 'later' }, PROJECTS).error, /status/);
  assert.match(checkTaskEdit({ due: '2026-02-30' }, PROJECTS).error, /due/);
  assert.match(checkTaskEdit({ priority: 0 }, PROJECTS).error, /priority/);
  assert.match(checkTaskEdit({ est: 0 }, PROJECTS).error, /est/);
  assert.match(checkTaskEdit({ title: '  ' }, PROJECTS).error, /title/);
  assert.match(checkTaskEdit({ subtasks: ['ok', ''] }, PROJECTS).error, /subtasks/);
  assert.match(checkTaskEdit({ claude_model: 'gpt' }, PROJECTS).error, /claude_model/);
  assert.match(checkTaskEdit({ claude_effort: 'huge' }, PROJECTS).error, /claude_effort/);
});

test('checkProjectEdit: create needs a name and picks a free colour; update takes what it gets', () => {
  assert.deepEqual(checkProjectEdit({ name: ' New ' }, PROJECTS, { create: true }).value, { name: 'New', color: PROJECT_PALETTE[1].hex });
  assert.match(checkProjectEdit({}, PROJECTS, { create: true }).error, /name/);
  assert.deepEqual(checkProjectEdit({ completed: true, position: 2, repo_path: null }, PROJECTS).value,
    { completed: true, position: 2, repo_path: null });
  assert.match(checkProjectEdit({ color: 'red' }, PROJECTS).error, /color/);
  assert.match(checkProjectEdit({ completed: 'yes' }, PROJECTS).error, /completed/);
  assert.match(checkProjectEdit({ position: 0 }, PROJECTS).error, /position/);
  assert.match(checkProjectEdit({ bogus: 1 }, PROJECTS).error, /bogus/);
  assert.match(checkProjectEdit({}, PROJECTS).error, /Nothing to change/);
});

test('nextProjectColor, toSubtasks and reorderIds', () => {
  assert.equal(nextProjectColor([]), PROJECT_PALETTE[0].hex);
  const all = PROJECT_PALETTE.map((c, i) => ({ id: String(i), color: c.hex }));
  assert.equal(nextProjectColor(all), PROJECT_PALETTE[all.length % PROJECT_PALETTE.length].hex);
  assert.deepEqual(toSubtasks([{ t: ' a ', done: 1 }, '[ ] b']), [{ t: 'a', done: true }, { t: 'b', done: false }]);
  assert.equal(toSubtasks('a'), null);
  const list = [{ id: 'a', sort_order: 1 }, { id: 'b', sort_order: 2 }, { id: 'c', sort_order: 3 }];
  assert.deepEqual(reorderIds(list, 'c', 1), [{ id: 'c', sort_order: 1 }, { id: 'a', sort_order: 2 }, { id: 'b', sort_order: 3 }]);
  assert.deepEqual(reorderIds(list, 'a', 99), [{ id: 'b', sort_order: 1 }, { id: 'c', sort_order: 2 }, { id: 'a', sort_order: 3 }]);
  assert.deepEqual(reorderIds(list, 'b', 2), []);
  assert.deepEqual(reorderIds(list, 'zz', 1), []);
});
