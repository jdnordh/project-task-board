/**
 * fx.js — picks the feature-completion animation (pure).
 */

export const FX = [
  { id: 'confetti', ms: 1500 },
  { id: 'rocket', ms: 1500 },
  { id: 'shatter', ms: 1500 },
  { id: 'blackhole', ms: 1400 },
  { id: 'stamp', ms: 1500 },
  { id: 'fireworks', ms: 1600 },
];

export function pickFx(extrasOn, last, rand = Math.random) {
  if (!extrasOn) return { id: 'swipe', ms: 560 };
  const pool = FX.filter((f) => f.id !== last);
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
