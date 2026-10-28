/**
 * agent.js — rules for the Claude column (pure, browser-safe).
 *
 * The prompt the board copies, the working rules a session follows, the
 * model/effort hint and the agent-state helpers all live here so the server,
 * the MCP server, the CLI and the client share one copy.
 */

import { AGENT_STATES, NOTE_MAX, CLAUDE_MODELS } from './constants.js';

/** Collapse whitespace, trim, truncate (never refuse) past NOTE_MAX. */
export function cleanNote(note) {
  const s = String(note ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= NOTE_MAX) return s;
  return s.slice(0, NOTE_MAX - 1).trimEnd() + '…';
}

export function isAgentState(s) {
  return s === null || AGENT_STATES.includes(s);
}

/** Entering the Claude column resets the agent fields; anything else keeps them. */
export function agentFieldsOnMove(from, to) {
  if (to === 'claude' && from !== 'claude') {
    return { agent_state: null, agent_note: '', agent_at: null };
  }
  return {};
}

/** Sort rank inside the Claude column: what needs the user comes first. */
export const AGENT_RANK = { question: 0, review: 1, complete: 2, running: 3, waiting: 4 };

export function agentRank(state) {
  return AGENT_RANK[state ?? 'waiting'] ?? AGENT_RANK.waiting;
}

const FILLER = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'with', 'and', 'in', 'on', 'at', 'by', 'from', 'into', 'so', 'that']);

export function shortTaskName(title) {
  const words = String(title ?? '')
    .replace(/[^\p{L}\p{N}'\-\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((w) => !FILLER.has(w.toLowerCase()));
  return (kept.length ? kept : words).slice(0, 4).join(' ');
}

export function sessionTitle(task, featureName) {
  const short = shortTaskName(task.title) || task.id;
  return featureName ? `${featureName}: ${short}` : short;
}

export function claudePrompt(task, cliPath, featureName) {
  const cli = String(cliPath ?? '').replace(/\\/g, '/');
  return [
    `Please work on my Grove task ${task.id}: "${task.title}".`,
    `Name this session "${sessionTitle(task, featureName)}".`,
    `Use the grove-agent MCP tools. Start with get_task.`,
    `No such tools? Run: node "${cli}" task ${task.id}`,
  ].join('\n');
}

/** Model and effort resolve separately: the task's value, then the feature's, else null. */
export function claudeSetup(task, feature) {
  return {
    model: task?.claude_model ?? feature?.claude_model ?? null,
    effort: task?.claude_effort ?? feature?.claude_effort ?? null,
  };
}

/** "Opus · high effort", "Sonnet", "max effort", or '' when nothing is set. */
export function setupLabel(setup) {
  const parts = [];
  if (setup?.model) parts.push(CLAUDE_MODELS.find((m) => m.id === setup.model)?.label ?? setup.model);
  if (setup?.effort) parts.push(`${setup.effort} effort`);
  return parts.join(' · ');
}

/**
 * The working rules a Claude session follows. This is their only copy.
 * With `cli` (and `id`) the commands are CLI commands; otherwise MCP tools.
 * Returns an array of lines.
 */
export function agentRules({ cli, id, title } = {}) {
  const t = cli
    ? {
        status: (s, n) => `${cli} task-status ${id} ${s} "${n}"`,
        report: `${cli} task-report ${id} @report.md (or - for stdin)`,
        file: `${cli} task-file ${id} <file.html> --title="<name>"`,
        subtask: `${cli} task-subtask ${id} <n> (n counts from 1; add "undone" to untick)`,
      }
    : {
        status: (s, n) => `set_task_status ${s} "${n}"`,
        report: 'set_task_report',
        file: 'link_task_file',
        subtask: 'check_subtask <n> (the number get_task shows; done: false to untick)',
      };
  const name = title ? `"${title}"` : 'the "Session title" the task shows';
  return [
    'The user watches this task as a card in the Claude column of their Grove board. Keep the card current:',
    `1. If you can rename your session (a session-title tool, or /rename), name it ${name}, so the user can tell which feature and task it is.`,
    `2. After reading the task, set status running: ${t.status('running', '<what you are doing now>')}`,
    '3. Update the running note when you move to a new step.',
    `4. Before you stop to ask the user something, set status question: ${t.status('question', '<the question>')}`,
    '5. When they answer and you go on, set status running again.',
    `6. If the task has subtasks, tick each one as soon as you finish it: ${t.subtask}. Tick only work you really did.`,
    `7. When the work is done, set status complete: ${t.status('complete', '<one-line summary>')}. Do not move the card; the user reviews it and moves it to Done.`,
    '8. Keep each note under 280 characters.',
    `9. For anything longer, write a markdown report (headings, bullets, **bold**, [links](https://…)): ${t.report}. Each report replaces the last, so send all of it each time.`,
    `10. If you make an HTML page for the user (a mock-up, a chart, a write-up), save it as one self-contained .html file and link it: ${t.file}. That returns a markdown link: put it in your report. Save the file outside any git repo (your scratchpad folder is good). Grove keeps a copy in its database when you link it, so the file may be deleted after. If you change the file, link it again to update the copy.`,
    'The Grove server must be running. If it cannot be reached, tell the user and carry on with the task.',
  ];
}
