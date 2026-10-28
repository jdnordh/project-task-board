/**
 * helpers.js — boots an in-memory Grove API for a test file.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createStore } from '../src/store.js';
import { createApp } from '../src/app.js';

export const TOKEN = 'test-token';

export async function startApi() {
  const db = openDb(':memory:', { log: () => {} });
  const store = createStore(db, { cliPath: 'C:/repo/scripts/grove.js' });
  const app = createApp(store, { token: TOKEN });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grove-test-'));

  async function api(method, url, body, headers = {}) {
    const raw = Buffer.isBuffer(body);
    const res = await fetch(base + url, {
      method,
      headers: raw ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let json;
    try { json = JSON.parse(buf.toString('utf8')); } catch { json = buf; }
    return { status: res.status, body: json, headers: res.headers, buf };
  }
  const feature = async (name = 'Core') => (await api('POST', '/api/features', { name, color: '#38E1FF' })).body;
  const close = () => {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  return { api, feature, store, db, tmp, base, close };
}
