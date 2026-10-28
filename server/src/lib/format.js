/**
 * format.js — display helpers shared by the board and the server (pure).
 */

import { daysUntil, parseLocalDate } from './dates.js';

/** 3 → "3h", 0.5 → "30m", 1.5 → "1h 30m", 1.25 → "1h 15m", else one decimal + "h". */
export function fmtHours(h) {
  if (h === null || h === undefined || !Number.isFinite(Number(h))) return '—';
  const n = Number(h);
  if (Number.isInteger(n)) return `${n}h`;
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 100) / 100;
  if (frac === 0.5 || frac === 0.25 || frac === 0.75) {
    const m = `${Math.round(frac * 60)}m`;
    return whole ? `${whole}h ${m}` : m;
  }
  return `${n.toFixed(1)}h`;
}

/** Local days from today: Today / Tomorrow / Yesterday / Nd overdue / in Nd / "Mon D". */
export function fmtDue(iso, now = new Date()) {
  if (!iso) return 'No date';
  const d = daysUntil(iso, now);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d < -1) return `${-d}d overdue`;
  if (d <= 7) return `in ${d}d`;
  return parseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** CSS colour token for a due date. */
export function dueTone(iso, now = new Date()) {
  if (!iso) return 'var(--fg-3)';
  const d = daysUntil(iso, now);
  if (d < 0) return 'var(--danger)';
  if (d <= 1) return 'var(--warning)';
  return 'var(--fg-2)';
}

/** "just now", "Nm ago", "Nh ago", "Nd ago" (rounded). */
export function fmtAge(isoTs, now = Date.now()) {
  if (!isoTs) return '';
  const ms = now - new Date(isoTs).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(ms / 3600000);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(ms / 86400000)}d ago`;
}

/** Duration in hours → "45m", "2h 10m", "3d 4h". */
export function fmtDuration(hours) {
  const mins = Math.round(Math.abs(hours) * 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

/** Estimate stepper step: 0.25 up to 0.5, then 0.5. */
export function estStep(value, dir) {
  const v = Number(value) || 0;
  if (dir > 0) return v < 0.5 ? 0.25 : 0.5;
  return v <= 0.5 ? 0.25 : 0.5;
}

/** Round to 2 decimals and clamp. */
export function clampStep(v, min, max) {
  const r = Math.round(Number(v) * 100) / 100;
  return Math.min(max, Math.max(min, r));
}
