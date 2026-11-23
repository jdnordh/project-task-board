/**
 * format.js — the one-line text the MCP tools return for lists.
 */

import { fmtHours, fmtAge } from '../src/lib/format.js';

export function projectLine(f, counts) {
  const done = f.completed ? ' [completed]' : '';
  const repo = f.repo_path ? ` · repo ${f.repo_path}` : '';
  return `${f.id} ${f.name}${done} (${counts.open} open of ${counts.total} tasks)${repo}`;
}

/** get_project: every field, then one line per task. */
export function formatProject(p, tasks, total) {
  const setup = [p.claude_model, p.claude_effort].filter(Boolean).join(' · ');
  const lines = [
    `${p.id} — ${p.name}${p.completed ? ' [completed]' : ''}`,
    `Colour: ${p.color}${p.skin ? ` · skin ${p.skin}` : ''}`,
    `Position: ${p.sort_order}`,
    `Repo folder: ${p.repo_path ?? 'not set'}`,
    `Claude model · effort: ${setup || 'not set'}`,
    `Tasks (${tasks.length} shown of ${total}):`,
  ];
  for (const t of tasks) lines.push(`- ${taskLine(t, p.name)}`);
  if (!tasks.length) lines.push('- none');
  return lines.join('\n');
}

export function taskLine(t, projectName) {
  const agent = t.agent_state ? ` · Claude: ${t.agent_state}` : '';
  return `${t.id} · ${projectName ?? '—'}: ${t.title} · ${t.status} · P${t.priority} · ${fmtHours(t.est)} · due ${t.due ?? '—'}${agent}`;
}

export function noteLine(n, projectName) {
  const project = projectName ? ` [${projectName}]` : '';
  const head = `${n.id} · ${n.meeting_date} · ${n.title}${project} (${n.actions.open}/${n.actions.total} action items open)`;
  return n.excerpt ? `${head}\n    ${n.excerpt}` : head;
}

export function formatNote(n) {
  const lines = [n.title, `Date: ${n.meeting_date}`, `Project: ${n.project_name ?? 'none'}`, `Id: ${n.id}`, '', n.body_text || '(empty)'];
  if (n.transcript?.trim()) lines.push('', '--- Transcript ---', n.transcript.trim());
  return lines.join('\n');
}

export function claudeLine(t, now = Date.now()) {
  const state = `${t.agent_state ?? 'waiting'}${t.agent_note ? ` — ${t.agent_note}` : ''}`;
  const age = t.agent_at ? fmtAge(t.agent_at, now) : 'no update yet';
  const subs = t.subtasks.length ? ` · subtasks ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : '';
  const files = t.files.length ? t.files.map((f) => f.id).join(', ') : 'none';
  return `${t.id} · ${t.project_name ?? '—'}: ${t.title} · ${state} · ${age} · report ${t.agent_report ? 'yes' : 'no'}${subs} · files ${files}`;
}
