/**
 * dates.js — local-calendar date helpers (pure, browser-safe).
 *
 * A due date is a local `YYYY-MM-DD`. "Today" always comes from local date
 * parts, never from toISOString(), which is UTC.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Local `YYYY-MM-DD` for a Date (default now). */
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse `YYYY-MM-DD` as local midnight. */
export function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

/** Whole local days from `now` to the date string (negative = past). */
export function daysUntil(iso, now = new Date()) {
  const a = parseLocalDate(localDate(now));
  const b = parseLocalDate(iso);
  return Math.round((b - a) / 86400000);
}

/** This Friday; on a weekend, the coming Friday. */
export function endOfWeek(now = new Date()) {
  const dow = now.getDay(); // 0 Sun .. 6 Sat
  const delta = dow === 6 ? 6 : (5 - dow + 7) % 7;
  return addDays(now, delta);
}

/** Monday (local midnight) of the week containing d. */
export function weekStart(d) {
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  return addDays(d, -dow);
}
