/**
 * index.js — server entry point. Opens the one SQLite connection, then
 * listens on PORT (default 3004). Vite proxies /api/* here.
 */

import path from 'node:path';
import { openDb } from './db.js';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { createAchievements } from './achievements.js';
import { REPO_ROOT, ensureEnv } from './env.js';

const env = ensureEnv();
const PORT = Number(env.PORT) || 3004;
const DATA = path.join(REPO_ROOT, 'server', 'data');
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'grove.js').replace(/\\/g, '/');

const db = openDb(path.join(DATA, 'grove.db'), { legacyPath: path.join(DATA, 'kanban.db') });
const store = createStore(db, { cliPath: CLI_PATH });
const app = createApp(store, { token: env.GROVE_TOKEN, achievements: createAchievements(store) });

app.listen(PORT, () => {
  console.log(`Grove server on http://localhost:${PORT}`);
});
