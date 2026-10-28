/**
 * images.js — rules for pictures in task descriptions and reports (pure,
 * browser-safe). Only raster types we can recognise by their first bytes;
 * never SVG, which can carry script.
 */

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
export const IMAGE_EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

const startsWith = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

/** The image's mime type from its magic bytes, or null. `buf` is a Uint8Array/Buffer. */
export function sniffImage(buf) {
  if (!buf || buf.length < 4) return null;
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, ascii('GIF87a')) || startsWith(buf, ascii('GIF89a'))) return 'image/gif';
  if (buf.length >= 12 && startsWith(buf, ascii('RIFF')) && startsWith(buf, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

/** Ids of `/api/images/<id>` pictures in an HTML string, in order (relative or localhost URLs). */
export function imageIds(html) {
  const out = [];
  const re = /<img\b[^>]*?\bsrc\s*=\s*["'](?:https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)?\/api\/images\/([A-Za-z0-9_-]+)["']/gi;
  for (const m of String(html ?? '').matchAll(re)) out.push(m[1]);
  return out;
}
