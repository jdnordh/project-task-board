/**
 * constants.js — shared board constants (pure, browser-safe).
 *
 * Imported by the server and by the client, so it must not touch Node APIs.
 */

export const COLUMNS = [
  { id: 'backlog',  label: 'Backlog',     icon: 'inbox' },
  { id: 'week',     label: 'This Week',   icon: 'calendar' },
  { id: 'progress', label: 'In Progress', icon: 'play' },
  { id: 'claude',   label: 'Claude',      icon: 'claude' },
  { id: 'blocked',  label: 'Blocked',     icon: 'octagon-x' },
  { id: 'done',     label: 'Done',        icon: 'check-check' },
];

export const COLUMN_IDS = COLUMNS.map((c) => c.id);

export const IN_PROGRESS = new Set(['progress', 'claude']);

export const DEFAULT_EST = 0.5;
export const DEFAULT_EST_MAX = 80;

/** Default estimate from a raw setting: a finite number in (0, 80], else 0.5. */
export function cleanDefaultEst(raw) {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_EST;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > DEFAULT_EST_MAX) return DEFAULT_EST;
  return n;
}

/** The In Progress column takes the user's name when one is set. */
export function columnLabel(col, userName) {
  if (col.id === 'progress' && typeof userName === 'string' && userName.trim()) {
    return userName.trim();
  }
  return col.label;
}

export const FEATURE_PALETTE = [
  { id: 'cyan',     hex: '#38E1FF', name: 'Cyan' },
  { id: 'violet',   hex: '#B68CFF', name: 'Violet' },
  { id: 'mint',     hex: '#34E5A0', name: 'Mint' },
  { id: 'amber',    hex: '#FFB23E', name: 'Amber' },
  { id: 'rose',     hex: '#FF5C72', name: 'Rose' },
  { id: 'blue',     hex: '#5B8DEF', name: 'Blue' },
  { id: 'pink',     hex: '#F472D0', name: 'Pink' },
  { id: 'lime',     hex: '#A3E635', name: 'Lime' },
  { id: 'orange',   hex: '#FF7A4A', name: 'Orange' },
  { id: 'teal',     hex: '#00CFBB', name: 'Teal' },
  { id: 'yellow',   hex: '#FFE566', name: 'Yellow' },
  { id: 'coral',    hex: '#FF7070', name: 'Coral' },
  { id: 'indigo',   hex: '#7B7FFF', name: 'Indigo' },
  { id: 'lavender', hex: '#D4AEFF', name: 'Lavender' },
];

export const CLAUDE_MODELS = [
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'fable', label: 'Fable' },
];
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const AGENT_STATES = ['running', 'question', 'review', 'complete'];
export const NOTE_MAX = 280;

export function cleanModel(v) {
  return CLAUDE_MODELS.some((m) => m.id === v) ? v : null;
}

export function cleanEffort(v) {
  return CLAUDE_EFFORTS.includes(v) ? v : null;
}

/** Card density, baked in as "comfortable". */
export const DENSITY = { pad: 16, gap: 12, title: 15, titleLines: 4, meta: 11, colGap: 13 };
