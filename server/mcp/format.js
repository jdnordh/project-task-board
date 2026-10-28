/**
 * format.js — the one-line text the MCP tools return for lists.
 */

import { fmtHours, fmtAge } from '../src/lib/format.js';

export function featureLine(f, counts) {
  const done = f.completed ? ' [completed]' : '';
  const repo = f.repo_path ? ` · repo ${f.repo_path}` : '';
  return `${f.id} ${f.name}${done} (${counts.open} open of ${counts.total} tasks)${repo}`;
}

export function taskLine(t, featureName) {
  const agent = t.agent_state ? ` · Claude: ${t.agent_state}` : '';
  return `${t.id} · ${featureName ?? '—'}: ${t.title} · ${t.status} · P${t.priority} · ${fmtHours(t.est)} · due ${t.due ?? '—'}${agent}`;
}

export function noteLine(n, featureName) {
  const feature = featureName ? ` [${featureName}]` : '';
  const head = `${n.id} · ${n.meeting_date} · ${n.title}${feature} (${n.actions.open}/${n.actions.total} action items open)`;
  return n.excerpt ? `${head}\n    ${n.excerpt}` : head;
}

export function formatNote(n) {
  const lines = [n.title, `Date: ${n.meeting_date}`, `Feature: ${n.feature_name ?? 'none'}`, `Id: ${n.id}`, '', n.body_text || '(empty)'];
  if (n.transcript?.trim()) lines.push('', '--- Transcript ---', n.transcript.trim());
  return lines.join('\n');
}

export function claudeLine(t, now = Date.now()) {
  const state = `${t.agent_state ?? 'waiting'}${t.agent_note ? ` — ${t.agent_note}` : ''}`;
  const age = t.agent_at ? fmtAge(t.agent_at, now) : 'no update yet';
  const subs = t.subtasks.length ? ` · subtasks ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : '';
  const files = t.files.length ? t.files.map((f) => f.id).join(', ') : 'none';
  return `${t.id} · ${t.feature_name ?? '—'}: ${t.title} · ${state} · ${age} · report ${t.agent_report ? 'yes' : 'no'}${subs} · files ${files}`;
}
