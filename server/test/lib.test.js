import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDefaultEst, columnLabel, COLUMNS } from '../src/lib/constants.js';
import { stripHtml, textToHtml, deriveDesc } from '../src/lib/desc.js';
import { localDate, endOfWeek, daysUntil } from '../src/lib/dates.js';
import { fmtHours, fmtDue, dueTone, fmtAge, estStep } from '../src/lib/format.js';
import {
  cleanNote, agentFieldsOnMove, shortTaskName, sessionTitle, claudePrompt, agentRules, claudeSetup, setupLabel,
} from '../src/lib/agent.js';
import {
  validateTemplate, resolveDue, applyTemplate, fieldsFromTask, recentTemplates, templateSummary,
} from '../src/lib/templates.js';
import { parseHidden, effectiveHidden, firstVisible, lockReason, turnOn, turnOff } from '../src/lib/pages.js';
import { pickFx } from '../src/lib/fx.js';
import { sortColumn, doneWindowMs } from '../src/lib/board.js';
import { camosCrossed, cleanSkin } from '../src/lib/skins.js';
import { genId } from '../src/lib/ids.js';

test('cleanDefaultEst', () => {
  assert.equal(cleanDefaultEst(null), 0.5);
  assert.equal(cleanDefaultEst(''), 0.5);
  assert.equal(cleanDefaultEst('2'), 2);
  assert.equal(cleanDefaultEst('0'), 0.5);
  assert.equal(cleanDefaultEst('81'), 0.5);
  assert.equal(cleanDefaultEst('abc'), 0.5);
});

test('columnLabel uses the trimmed user name for In Progress only', () => {
  const progress = COLUMNS.find((c) => c.id === 'progress');
  assert.equal(columnLabel(progress, '  Sam '), 'Sam');
  assert.equal(columnLabel(progress, '  '), 'In Progress');
  assert.equal(columnLabel(COLUMNS[0], 'Sam'), 'Backlog');
});

test('genId encodes a prefix and is unique', () => {
  const a = genId('t');
  const b = genId('t');
  assert.ok(a.startsWith('t'));
  assert.notEqual(a, b);
});

test('stripHtml writes links as label (href), once when equal', () => {
  assert.equal(stripHtml('<p>See <a href="https://x.io">docs</a></p>'), 'See docs (https://x.io)');
  assert.equal(stripHtml('<p><a href="https://x.io">https://x.io</a></p>'), 'https://x.io');
  assert.equal(stripHtml('<p>a &amp; b</p><p>c</p>'), 'a & b\nc');
});

test('textToHtml escapes and wraps lines', () => {
  assert.equal(textToHtml('a<b\n"c" & d'), '<p>a&lt;b</p><p>&quot;c&quot; &amp; d</p>');
});

test('deriveDesc table', () => {
  assert.deepEqual(deriveDesc({ title: 'x' }), {});
  assert.deepEqual(deriveDesc({ desc_html: '<p>hi</p>' }), { desc_html: '<p>hi</p>', desc: 'hi' });
  assert.deepEqual(deriveDesc({ desc: 'hi' }), { desc: 'hi', desc_html: '' });
  assert.deepEqual(deriveDesc({ desc: 'a', desc_html: '<p>b</p>' }), { desc: 'a', desc_html: '<p>b</p>' });
});

test('local dates and end of week', () => {
  const wed = new Date(2026, 9, 28, 23, 30); // Wed 28 Oct 2026, late evening local
  assert.equal(localDate(wed), '2026-10-28');
  assert.equal(localDate(endOfWeek(wed)), '2026-10-30');
  assert.equal(localDate(endOfWeek(new Date(2026, 9, 31))), '2026-11-06'); // Saturday → next Friday
  assert.equal(localDate(endOfWeek(new Date(2026, 10, 1))), '2026-11-06'); // Sunday
  assert.equal(localDate(endOfWeek(new Date(2026, 9, 30))), '2026-10-30'); // Friday
  assert.equal(daysUntil('2026-10-27', wed), -1);
});

test('fmtHours', () => {
  assert.equal(fmtHours(null), '—');
  assert.equal(fmtHours(3), '3h');
  assert.equal(fmtHours(0.5), '30m');
  assert.equal(fmtHours(1.5), '1h 30m');
  assert.equal(fmtHours(0.25), '15m');
  assert.equal(fmtHours(1.25), '1h 15m');
  assert.equal(fmtHours(1.3), '1.3h');
});

test('fmtDue and dueTone', () => {
  const now = new Date(2026, 9, 28, 9);
  assert.equal(fmtDue('2026-10-28', now), 'Today');
  assert.equal(fmtDue('2026-10-29', now), 'Tomorrow');
  assert.equal(fmtDue('2026-10-27', now), 'Yesterday');
  assert.equal(fmtDue('2026-10-25', now), '3d overdue');
  assert.equal(fmtDue('2026-11-04', now), 'in 7d');
  assert.equal(fmtDue('2026-11-20', now), 'Nov 20');
  assert.equal(dueTone(null, now), 'var(--fg-3)');
  assert.equal(dueTone('2026-10-27', now), 'var(--danger)');
  assert.equal(dueTone('2026-10-29', now), 'var(--warning)');
  assert.equal(dueTone('2026-11-02', now), 'var(--fg-2)');
});

test('fmtAge and estStep', () => {
  const t = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(fmtAge('2026-10-28T11:59:50Z', t), 'just now');
  assert.equal(fmtAge('2026-10-28T11:55:00Z', t), '5m ago');
  assert.equal(fmtAge('2026-10-28T09:00:00Z', t), '3h ago');
  assert.equal(fmtAge('2026-10-26T12:00:00Z', t), '2d ago');
  assert.equal(estStep(0.25, 1), 0.25);
  assert.equal(estStep(0.5, 1), 0.5);
  assert.equal(estStep(0.5, -1), 0.25);
  assert.equal(estStep(1, -1), 0.5);
});

test('cleanNote collapses and truncates', () => {
  assert.equal(cleanNote('  a \n  b  '), 'a b');
  const long = cleanNote('x'.repeat(300));
  assert.equal(long.length, 280);
  assert.ok(long.endsWith('…'));
});

test('agentFieldsOnMove resets only on entering Claude', () => {
  assert.deepEqual(agentFieldsOnMove('progress', 'claude'), { agent_state: null, agent_note: '', agent_at: null });
  assert.deepEqual(agentFieldsOnMove('claude', 'claude'), {});
  assert.deepEqual(agentFieldsOnMove('claude', 'done'), {});
});

test('shortTaskName and sessionTitle', () => {
  assert.equal(shortTaskName('Fix the login bug on the settings page!'), 'Fix login bug settings');
  assert.equal(shortTaskName('The and of'), 'The and of');
  assert.equal(sessionTitle({ id: 't1', title: 'Add dark mode toggle' }, 'UI'), 'UI: Add dark mode toggle');
  assert.equal(sessionTitle({ id: 't1', title: '!!!' }, null), 't1');
});

test('claudePrompt is four lines and says Grove, not Cadence', () => {
  const p = claudePrompt({ id: 'tabc', title: 'Ship it' }, 'C:\\repo\\scripts\\grove.js', 'Core');
  const lines = p.split('\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[0], 'Please work on my Grove task tabc: "Ship it".');
  assert.equal(lines[1], 'Name this session "Core: Ship it".');
  assert.equal(lines[3], 'No such tools? Run: node "C:/repo/scripts/grove.js" task tabc');
  assert.ok(!/cadence/i.test(p));
});

test('agentRules has both forms and no Cadence', () => {
  const mcp = agentRules().join('\n');
  assert.match(mcp, /set_task_status running "<what you are doing now>"/);
  assert.match(mcp, /the "Session title" the task shows/);
  const cli = agentRules({ cli: 'node x.js', id: 't1', title: 'A: B' }).join('\n');
  assert.match(cli, /node x\.js task-status t1 complete "<one-line summary>"/);
  assert.match(cli, /name it "A: B"/);
  assert.ok(!/cadence/i.test(mcp + cli));
  assert.equal(agentRules().length, 14);
});

test('claudeSetup resolves model and effort separately', () => {
  assert.deepEqual(claudeSetup({ claude_model: null, claude_effort: 'max' }, { claude_model: 'opus', claude_effort: 'low' }), { model: 'opus', effort: 'max' });
  assert.equal(setupLabel({ model: 'opus', effort: 'high' }), 'Opus · high effort');
  assert.equal(setupLabel({ model: 'sonnet', effort: null }), 'Sonnet');
  assert.equal(setupLabel({ model: null, effort: 'max' }), 'max effort');
});

test('validateTemplate', () => {
  assert.ok(validateTemplate({ name: ' ' }).error);
  assert.ok(validateTemplate({ name: 'x'.repeat(81) }).error);
  assert.ok(validateTemplate({ name: 'a', fields: { bogus: 1 } }).error);
  assert.ok(validateTemplate({ name: 'a', fields: { priority: 0 } }).error);
  assert.ok(validateTemplate({ name: 'a', fields: { status: 'nope' } }).error);
  const { value } = validateTemplate({
    name: ' Bug ', fields: { desc: 'Repro steps', subtasks: [' a ', { t: 'b' }, ''], due: { kind: 'days', n: 3 }, desc_html: undefined },
  });
  assert.equal(value.name, 'Bug');
  assert.equal(value.fields.desc_html, '<p>Repro steps</p>');
  assert.deepEqual(value.fields.subtasks, [{ t: 'a', done: false }, { t: 'b', done: false }]);
  assert.deepEqual(value.fields.due, { kind: 'days', n: 3 });
  assert.deepEqual(validateTemplate({ name: 'a', fields: { subtasks: [' '] } }).value.fields, {});
  assert.deepEqual(validateTemplate({ fields: {} }, { partial: true }).value, { fields: {} });
});

test('resolveDue uses local dates', () => {
  const now = new Date(2026, 9, 28, 23, 50);
  assert.equal(resolveDue({ kind: 'today' }, now), '2026-10-28');
  assert.equal(resolveDue({ kind: 'eow' }, now), '2026-10-30');
  assert.equal(resolveDue({ kind: 'days', n: 5 }, now), '2026-11-02');
});

test('applyTemplate twice adds nothing new', () => {
  const draft = { title: '', feature: 'f1', priority: 2, desc: '', desc_html: '', subtasks: [{ t: 'Write tests', done: true }] };
  const fields = { title: 'Bug', priority: 1, feature: 'gone', desc_html: '<p>Steps</p>', subtasks: [{ t: 'write tests' }, { t: 'Fix' }] };
  const once = applyTemplate(draft, fields, { featureIds: ['f1'] });
  assert.equal(once.title, 'Bug');
  assert.equal(once.feature, 'f1');
  assert.equal(once.desc, 'Steps');
  assert.deepEqual(once.subtasks, [{ t: 'Write tests', done: true }, { t: 'Fix', done: false }]);
  const twice = applyTemplate(once, fields, { featureIds: ['f1'] });
  assert.equal(twice.desc_html, once.desc_html);
  assert.equal(twice.subtasks.length, 2);
});

test('fieldsFromTask skips due, done status, empty parts', () => {
  const f = fieldsFromTask({ title: 'T', feature: 'f1', status: 'done', priority: 2, est: 1, due: '2026-01-01',
    desc: '', desc_html: '', subtasks: [], claude_model: null, claude_effort: 'high' });
  assert.deepEqual(f, { title: 'T', feature: 'f1', priority: 2, est: 1, claude_effort: 'high' });
});

test('recentTemplates and templateSummary', () => {
  const list = [
    { name: 'b', last_used_at: null }, { name: 'a', last_used_at: null },
    { name: 'z', last_used_at: '2026-01-02' }, { name: 'y', last_used_at: '2026-01-03' },
  ];
  assert.deepEqual(recentTemplates(list, 3).map((t) => t.name), ['y', 'z', 'a']);
  assert.equal(
    templateSummary({ feature: 'f1', priority: 2, est: 1, due: { kind: 'eow' }, subtasks: [1, 2, 3], claude_model: 'opus', claude_effort: 'high' }, [{ id: 'f1', name: 'Core' }]),
    'Core · P2 · 1h · Due end of week · 3 subtasks · Opus · high effort',
  );
});

test('page visibility rules', () => {
  assert.deepEqual(parseHidden('nope'), []);
  assert.deepEqual(parseHidden(null), []);
  assert.deepEqual(effectiveHidden([], false), ['achievements']);
  assert.equal(firstVisible(['board', 'features'], false), 'notes');
  assert.equal(firstVisible(['board', 'features', 'notes'], false), 'settings');
  assert.deepEqual(lockReason('features', [], false), { kind: 'needed', by: 'board' });
  assert.deepEqual(lockReason('board', ['features'], true), { kind: 'last' });
  assert.deepEqual(lockReason('features', ['board'], false), { kind: 'last' });
  assert.equal(lockReason('achievements', ['board'], true), null);
  assert.deepEqual(turnOn(['board', 'features'], 'board'), { hidden: [], also: ['features'] });
  assert.deepEqual(turnOff([], 'features', false), []);
  assert.deepEqual(turnOff([], 'board', false), ['board']);
});

test('pickFx', () => {
  assert.deepEqual(pickFx(false, null), { id: 'swipe', ms: 560 });
  for (let i = 0; i < 50; i++) assert.notEqual(pickFx(true, 'rocket').id, 'rocket');
});

test('sortColumn and done window', () => {
  const now = new Date(2026, 9, 28);
  const tasks = [
    { id: 'a', priority: 2, due: null, agent_state: 'running' },
    { id: 'b', priority: 2, due: '2026-10-29', agent_state: null },
    { id: 'c', priority: 1, due: null, agent_state: 'question' },
  ];
  assert.deepEqual(sortColumn(tasks, 'week', now).map((t) => t.id), ['c', 'b', 'a']);
  assert.deepEqual(sortColumn(tasks, 'claude', now).map((t) => t.id), ['c', 'a', 'b']);
  assert.equal(doneWindowMs(new Date(2026, 9, 26)), 72 * 3600000); // Monday
  assert.equal(doneWindowMs(now), 24 * 3600000);
});

test('skins', () => {
  assert.deepEqual(camosCrossed(0, 25), ['desert', 'arctic']);
  assert.deepEqual(camosCrossed(10, 10), []);
  assert.equal(cleanSkin('nope'), null);
  assert.equal(cleanSkin('fizz'), 'fizz');
});
