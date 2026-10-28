/**
 * ids.js — id generator. An id encodes its creation time:
 * prefix + Date.now() in base 36 + a per-process counter in base 36.
 */

let counter = 0;

export function genId(prefix) {
  counter += 1;
  return prefix + Date.now().toString(36) + counter.toString(36);
}
