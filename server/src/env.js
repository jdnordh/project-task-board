/**
 * env.js — reads `<repo>/.env` (PORT, GROVE_TOKEN). Creates the file with a
 * random token on first run so the gated routes work out of the box.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_PATH = path.join(REPO_ROOT, '.env');

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function readEnv(file = ENV_PATH) {
  try {
    return parseEnv(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** Make sure .env has a GROVE_TOKEN; returns the parsed env. */
export function ensureEnv(file = ENV_PATH) {
  const env = readEnv(file);
  if (!env.GROVE_TOKEN) {
    const token = crypto.randomBytes(24).toString('hex');
    const prefix = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\s*$/, '\n') : '';
    fs.writeFileSync(file, `${prefix}GROVE_TOKEN=${token}\n`);
    env.GROVE_TOKEN = token;
  }
  return env;
}
