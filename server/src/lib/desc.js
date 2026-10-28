/**
 * desc.js — keeps a task's rich-text description and its plaintext mirror
 * in sync (pure, browser-safe).
 *
 * `desc` is the plaintext mirror: the search haystack and the only
 * description text agents ever see.
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

function decode(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML → plaintext. Links become `label (href)`, or just once when equal. */
export function stripHtml(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, h1, h2, inner) => {
    const href = decode(h1 ?? h2 ?? '');
    const label = decode(inner.replace(/<[^>]+>/g, '')).trim();
    if (!label || label === href) return href;
    return `${label} (${href})`;
  });
  s = s.replace(/<img\b[^>]*>/gi, '[image]');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '\n- ');
  s = s.replace(/<\/(p|div|h[1-6]|li|pre|blockquote|ul|ol)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decode(s);
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Text → HTML: escape `& < > "`, wrap each line in <p>. */
export function textToHtml(text) {
  if (!text) return '';
  return String(text)
    .split(/\r?\n/)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join('');
}

/**
 * Work out which description fields a write should store.
 * `fields` may have `desc`, `desc_html`, both or neither.
 * Returns only the keys to write (empty object = keep existing values).
 */
export function deriveDesc(fields) {
  const hasText = fields.desc !== undefined;
  const hasHtml = fields.desc_html !== undefined;
  if (!hasText && !hasHtml) return {};
  if (hasHtml && !hasText) {
    const html = fields.desc_html ?? '';
    return { desc_html: html, desc: stripHtml(html) };
  }
  if (hasText && !hasHtml) return { desc: fields.desc ?? '', desc_html: '' };
  return { desc: fields.desc ?? '', desc_html: fields.desc_html ?? '' };
}
