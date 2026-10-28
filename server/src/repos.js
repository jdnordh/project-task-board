/**
 * repos.js — finds the git repos directly inside the user's base folder.
 */

import fs from 'node:fs';
import path from 'node:path';

const slash = (p) => p.replace(/\\/g, '/');

/** Direct children of `base` holding a `.git` folder or file (a worktree). Never throws. */
export function scanRepos(base) {
  const b = typeof base === 'string' ? base.trim() : '';
  if (!b) return { base: '', repos: [], error: 'No base folder set. Set one in Settings.' };
  let entries;
  try {
    entries = fs.readdirSync(b, { withFileTypes: true });
  } catch (err) {
    return { base: slash(b), repos: [], error: `Cannot read ${b}: ${err.code ?? err.message}` };
  }
  const repos = entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(b, e.name, '.git')))
    .map((e) => ({ name: e.name, path: slash(path.join(b, e.name)) }))
    .sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));
  return { base: slash(b), repos };
}
