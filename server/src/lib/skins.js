/**
 * skins.js — camo and animated skin catalogue (pure data, browser-safe).
 *
 * Camos unlock by total achievement points. Each animated skin is unlocked
 * by one secret achievement. `hex` is what features.color stores, so
 * colour-only surfaces still work.
 */

export const CAMOS = [
  { id: 'desert',    name: 'Desert',     unlockAt: 10,  hex: '#C8A46A' },
  { id: 'arctic',    name: 'Arctic',     unlockAt: 25,  hex: '#B9D3E0' },
  { id: 'woodland',  name: 'Woodland',   unlockAt: 45,  hex: '#5E7A3A' },
  { id: 'digital',   name: 'Digital',    unlockAt: 70,  hex: '#6E8A7A' },
  { id: 'urban',     name: 'Urban',      unlockAt: 100, hex: '#8A8F96' },
  { id: 'bluetiger', name: 'Blue Tiger', unlockAt: 135, hex: '#3E6FD8' },
  { id: 'redtiger',  name: 'Red Tiger',  unlockAt: 175, hex: '#C8402E' },
  { id: 'fall',      name: 'Fall',       unlockAt: 220, hex: '#D2772E' },
  { id: 'gold',      name: 'Gold',       unlockAt: 270, hex: '#E8B53C' },
  { id: 'platinum',  name: 'Platinum',   unlockAt: 320, hex: '#D6DCE4' },
  { id: 'damascus',  name: 'Damascus',   unlockAt: 380, hex: '#7C8794' },
  { id: 'obsidian',  name: 'Obsidian',   unlockAt: 450, hex: '#3A2E52' },
];

/** Animated skins. A harder secret gives a richer skin (more layers). */
export const SKINS = [
  { id: 'fizz', name: 'Cherry Fizz', hex: '#E8173A', secret: 'eat-the-frog',
    mini: ['#7a0018', '#e8173a', '#ff8fa3', '#e8173a'], dur: 2.6 },
  { id: 'ember', name: 'Ember', hex: '#FF7A2E', secret: 'night-owl',
    mini: ['#3a0a00', '#c2410c', '#ff7a2e', '#ffd166'], dur: 2.2 },
  { id: 'aurora', name: 'Aurora', hex: '#2EE6A6', secret: 'unstuck',
    mini: ['#06281f', '#11b981', '#2ee6a6', '#5fb8ff', '#11b981'], dur: 3 },
  { id: 'party', name: 'Party Rock', hex: '#FF5A5F', secret: 'bullseye',
    mini: ['#ff2e88', '#ff5a5f', '#ff8a3d', '#ffb000'], dur: 1 },
  { id: 'darkmatter', name: 'Dark Matter', hex: '#6A2CFF', secret: 'marathon',
    mini: ['#12145a', '#2a3ad8', '#7a2cf0', '#c070ff', '#d8d0f6', '#5a22d0'], dur: 3.2 },
];

export const SKIN_IDS = new Set([...CAMOS.map((c) => c.id), ...SKINS.map((s) => s.id)]);

/** An unknown skin id is stored as NULL. */
export function cleanSkin(id) {
  return typeof id === 'string' && SKIN_IDS.has(id) ? id : null;
}

/** Camo ids with before < unlockAt <= after. */
export function camosCrossed(before, after) {
  return CAMOS.filter((c) => before < c.unlockAt && c.unlockAt <= after).map((c) => c.id);
}

export function camosAt(points) {
  return CAMOS.filter((c) => c.unlockAt <= points).map((c) => c.id);
}
