/**
 * pages.js — sidebar page visibility (pure, browser-safe).
 *
 * `hidden_pages` stores hidden ids, so a page added later shows by default.
 * Hiding is display only: the API and the MCP server never read it.
 */

export const PAGES = [
  { id: 'board', label: 'Board', icon: 'columns-3' },
  { id: 'features', label: 'Features', icon: 'layers' },
  { id: 'notes', label: 'Notes', icon: 'notebook-pen' },
  { id: 'achievements', label: 'Achievements', icon: 'trophy', extras: true },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

/** Turning a page on turns these on too; they stay locked on while it shows. */
export const PAGE_NEEDS = { board: ['features'] };

const CORE = ['board', 'features'];

export function parseHidden(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x !== 'settings') : [];
  } catch {
    return [];
  }
}

/** Adds `achievements` while Extras is off. Never store the result. */
export function effectiveHidden(hidden, extras) {
  const set = new Set(hidden.filter((x) => x !== 'settings'));
  if (!extras) set.add('achievements');
  return [...set];
}

export function isVisible(id, hidden, extras) {
  return !effectiveHidden(hidden, extras).includes(id);
}

export function visiblePages(hidden, extras) {
  const eff = effectiveHidden(hidden, extras);
  return PAGES.filter((p) => !eff.includes(p.id));
}

/** First visible page id, else `settings`. */
export function firstVisible(hidden, extras) {
  return visiblePages(hidden, extras)[0]?.id ?? 'settings';
}

/** Pages the settings page lists (Settings never; Achievements only with Extras). */
export function hideablePages(extras) {
  return PAGES.filter((p) => p.id !== 'settings' && (!p.extras || extras));
}

/** Why a visible page cannot be turned off, or null. */
export function lockReason(id, hidden, extras) {
  if (!isVisible(id, hidden, extras)) return null;
  for (const [by, needs] of Object.entries(PAGE_NEEDS)) {
    if (needs.includes(id) && isVisible(by, hidden, extras)) return { kind: 'needed', by };
  }
  if (CORE.includes(id)) {
    const visibleCore = CORE.filter((p) => isVisible(p, hidden, extras));
    if (visibleCore.length === 1) return { kind: 'last' };
  }
  return null;
}

/** Returns `{ hidden, also }`; `also` lists prerequisites that were pulled in. */
export function turnOn(hidden, id) {
  const needs = PAGE_NEEDS[id] ?? [];
  const also = needs.filter((n) => hidden.includes(n));
  const drop = new Set([id, ...needs]);
  return { hidden: hidden.filter((h) => !drop.has(h)), also };
}

export function turnOff(hidden, id, extras) {
  if (id === 'settings' || lockReason(id, hidden, extras)) return hidden;
  return hidden.includes(id) ? hidden : [...hidden, id];
}
