/**
 * format-task.js — the text get_task returns to a Claude session.
 */

import { agentRules } from '../src/lib/agent.js';
import { fmtHours } from '../src/lib/format.js';

export function formatTask(t) {
  const lines = [
    `${t.id} — ${t.title}`,
    `Feature: ${t.feature_name ?? '—'}`,
    `Session title: ${t.session_title}`,
  ];
  if (t.user_name) lines.push(`User's name: ${t.user_name}`);
  if (t.setup_label) lines.push(`Suggested setup: ${t.setup_label}`);
  if (t.repo_path) lines.push(`Folder: ${t.repo_path}`);
  lines.push(`Status: ${t.status} · Priority P${t.priority} (1 is most urgent) · Estimate ${fmtHours(t.est)} · Due ${t.due ?? 'no date'}`);
  lines.push(`Description: ${t.desc?.trim() ? t.desc : '(none)'}`);
  if (t.subtasks.length) {
    lines.push('Subtasks:');
    t.subtasks.forEach((s, i) => lines.push(`${i + 1}. [${s.done ? 'x' : ' '}] ${s.t}`));
  } else {
    lines.push('Subtasks: none');
  }
  lines.push(`Your status: ${t.agent_state ?? 'not reported yet'}${t.agent_note ? ` — ${t.agent_note}` : ''}`);
  if (t.files.length) {
    lines.push('Linked files:');
    for (const f of t.files) lines.push(`- [${f.title}](${f.url}) ${f.path} (file id ${f.id})`);
  } else {
    lines.push('Linked files: none');
  }
  lines.push(`Your current report: ${t.agent_report ? `\n${t.agent_report}` : '(none)'}`);
  lines.push('', 'How to report:', ...agentRules({ title: t.session_title }));
  return lines.join('\n');
}
