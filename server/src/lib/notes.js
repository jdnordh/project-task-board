/**
 * notes.js — meeting-note rules (pure, browser-safe): the plain-text copy,
 * action-item counts and search.
 *
 * `body_text` is always made from `body_html` by noteText, on the server,
 * so a note saved from the editor and one saved through the API read the
 * same to agents and to search.
 */

import { stripHtml } from './desc.js';
import { shiftDate } from './dates.js';

export const NOTE_DEFAULT_DAYS = 14;
export const EXCERPT_LEN = 200;

const TASK_ITEM = /<li\b(?=[^>]*\bdata-type\s*=\s*["']taskItem["'])[^>]*>/gi;
const checked = (tag) => /\bdata-checked\s*=\s*["']true["']/i.test(tag);

/** HTML → plain text. Action items become `[ ] text` / `[x] text`. */
export function noteText(html) {
  if (!html) return '';
  // A marker without `<li`, so stripHtml does not also bullet it.
  const marked = String(html).replace(TASK_ITEM, (tag) => `<br>${checked(tag) ? '[x]' : '[ ]'} `);
  return stripHtml(marked)
    .split('\n')
    .map((l) => l.replace(/^(\[[ x]\]) +/, '$1 '))
    .filter((l) => l.trim())
    .join('\n');
}

/** `{open, total}` action items, from `data-checked` in the HTML. */
export function countActions(html) {
  const tags = String(html ?? '').match(TASK_ITEM) ?? [];
  return { open: tags.filter((t) => !checked(t)).length, total: tags.length };
}

/** Text of each unticked action item, in order. */
export function openActions(html) {
  return noteText(html)
    .split('\n')
    .filter((l) => l.startsWith('[ ] '))
    .map((l) => l.slice(4).trim())
    .filter(Boolean);
}

/** About EXCERPT_LEN characters of `text` around the first match of `word`. */
export function excerpt(text, word, len = EXCERPT_LEN) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= len) return s;
  const at = word ? s.toLowerCase().indexOf(String(word).toLowerCase()) : -1;
  if (at < 0) return s.slice(0, len).trimEnd() + '…';
  const start = Math.max(0, Math.min(at - Math.floor(len / 3), s.length - len));
  return (start > 0 ? '…' : '') + s.slice(start, start + len).trim() + (start + len < s.length ? '…' : '');
}

export function searchWords(q) {
  return String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Search full note rows. No `q` → the last NOTE_DEFAULT_DAYS days unless
 * from/to say otherwise; with `q` → all dates. `feature` is an id or 'none'.
 * Rows come back newest meeting first, without HTML, text or transcript.
 */
export function searchNotes(notes, { q, from, to, feature, today }) {
  const words = searchWords(q);
  const lo = from || (words.length ? null : shiftDate(today, -NOTE_DEFAULT_DAYS));
  const hi = to || null;
  return notes
    .filter((n) => (!lo || n.meeting_date >= lo) && (!hi || n.meeting_date <= hi))
    .filter((n) => !feature || (feature === 'none' ? !n.feature_id : n.feature_id === feature))
    .filter((n) => {
      if (!words.length) return true;
      const hay = `${n.title}\n${n.body_text}\n${n.transcript ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => (b.meeting_date.localeCompare(a.meeting_date)) || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    .map((n) => {
      const first = words[0];
      const inBody = !first || `${n.title}\n${n.body_text}`.toLowerCase().includes(first);
      return {
        id: n.id, title: n.title, meeting_date: n.meeting_date, feature_id: n.feature_id,
        created_at: n.created_at, updated_at: n.updated_at,
        actions: countActions(n.body_html),
        has_transcript: !!n.transcript?.trim(),
        excerpt: excerpt(inBody ? n.body_text : n.transcript, first),
      };
    });
}
