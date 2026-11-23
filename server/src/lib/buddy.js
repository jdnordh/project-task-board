/**
 * buddy.js — rules shared by the Buddy orchestrator's tools (pure, browser-safe).
 */

import { agentRank } from './agent.js';

/** Project by id, else by name (any case), else null. */
export function findProject(ref, projects) {
  const r = String(ref ?? '').trim();
  return projects.find((f) => f.id === r) ?? projects.find((f) => f.name.toLowerCase() === r.toLowerCase()) ?? null;
}

/** Claude-column order: what needs the user first, then oldest update first. */
export function sortClaude(tasks) {
  return [...tasks].sort((a, b) => agentRank(a.agent_state) - agentRank(b.agent_state) || String(a.agent_at ?? '').localeCompare(String(b.agent_at ?? '')));
}
