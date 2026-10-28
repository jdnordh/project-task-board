#!/usr/bin/env node
/**
 * grove.js — CLI fallback for Claude sessions without the grove-agent MCP
 * tools. Reads `<repo>/.env` for PORT and GROVE_TOKEN, always sends the
 * bearer, prints pretty JSON.
 *
 * Exit codes: 0 on 2xx, 1 on any other HTTP status, 3 on usage or
 * connection errors.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');

const USAGE = `Usage:
  node scripts/grove.js task <id>
  node scripts/grove.js task-status <id> <running|question|review|complete> [note...]
  node scripts/grove.js task-subtask <id> <n> [done|undone]
  node scripts/grove.js task-report <id> <@file.md | - | text...>
  node scripts/grove.js task-file <id> <path.html> [--title=..]
  node scripts/grove.js task-images <id> [folder]
  node scripts/grove.js task-image <id> <file.png> [--caption=..]`;

function readEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(REPO, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // no .env: requests go out without a token
  }
  return out;
}

function usage(msg) {
  if (msg) console.error(msg);
  console.error(USAGE);
  process.exit(3);
}

function readStdin() {
  return new Promise((resolve) => {
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { s += d; });
    process.stdin.on('end', () => resolve(s));
  });
}

async function request(method, url, body) {
  const env = readEnv();
  const port = Number(env.PORT) || 3004;
  const headers = { 'Content-Type': 'application/json' };
  if (env.GROVE_TOKEN) headers.Authorization = `Bearer ${env.GROVE_TOKEN}`;
  try {
    return await fetch(`http://localhost:${port}${url}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    console.error(`Grove is not running at localhost:${port}. Ask the user to start it (npm run dev in ${REPO.replace(/\\/g, '/')}).`);
    process.exit(3);
  }
}

const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** Save the pictures in a task's description and print their paths, in order. */
async function saveTaskImages(id, dir) {
  const res = await request('GET', `/api/tasks/${encodeURIComponent(id)}/images`);
  const list = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(list.error || `HTTP ${res.status}`);
    process.exit(1);
  }
  const out = path.resolve(dir || path.join(require('node:os').tmpdir(), 'grove-images', id));
  fs.mkdirSync(out, { recursive: true });
  const saved = [];
  for (const [i, img] of list.entries()) {
    const r = await request('GET', img.url);
    if (!r.ok) continue;
    const file = path.join(out, `${i + 1}-${img.id}.${IMAGE_EXT[img.mime] ?? 'img'}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    saved.push(file);
  }
  console.log(saved.length ? saved.join('\n') : 'No pictures in this task.');
  process.exit(0);
}

async function main() {
  const [cmd, id, ...rest] = process.argv.slice(2);
  if (!cmd || !id) usage();
  const enc = encodeURIComponent(id);
  let method;
  let url;
  let body;

  switch (cmd) {
    case 'task':
      method = 'GET';
      url = `/api/tasks/${enc}`;
      break;
    case 'task-status': {
      const [state, ...note] = rest;
      if (!state) usage('task-status needs a state');
      method = 'POST';
      url = `/api/tasks/${enc}/agent`;
      body = { state, note: note.join(' ') };
      break;
    }
    case 'task-subtask': {
      const [n, flag = 'done'] = rest;
      if (!n) usage('task-subtask needs n');
      if (flag !== 'done' && flag !== 'undone') usage('the last word must be done or undone');
      method = 'POST';
      url = `/api/tasks/${enc}/subtask`;
      body = { n: Number(n), done: flag === 'done' };
      break;
    }
    case 'task-report': {
      if (!rest.length) usage('task-report needs @file.md, - or text');
      let markdown;
      if (rest.length === 1 && rest[0] === '-') markdown = await readStdin();
      else if (rest.length === 1 && rest[0].startsWith('@')) {
        try {
          markdown = fs.readFileSync(path.resolve(rest[0].slice(1)), 'utf8');
        } catch (err) {
          usage(`cannot read ${rest[0].slice(1)}: ${err.message}`);
        }
      } else markdown = rest.join(' ');
      method = 'PUT';
      url = `/api/tasks/${enc}/report`;
      body = { markdown };
      break;
    }
    case 'task-file': {
      const titleArg = rest.find((a) => a.startsWith('--title='));
      const file = rest.find((a) => !a.startsWith('--title='));
      if (!file) usage('task-file needs a path');
      method = 'POST';
      url = `/api/tasks/${enc}/files`;
      body = { path: path.resolve(file), title: titleArg ? titleArg.slice('--title='.length) : undefined };
      break;
    }
    case 'task-image': {
      const captionArg = rest.find((a) => a.startsWith('--caption='));
      const file = rest.find((a) => !a.startsWith('--caption='));
      if (!file) usage('task-image needs a path');
      method = 'POST';
      url = `/api/tasks/${enc}/report-image`;
      body = { path: path.resolve(file), caption: captionArg ? captionArg.slice('--caption='.length) : undefined };
      break;
    }
    case 'task-images':
      return saveTaskImages(id, rest[0]);
    default:
      usage(`unknown command: ${cmd}`);
  }

  const res = await request(method, url, body);
  const text = await res.text();
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
  process.exit(res.ok ? 0 : 1);
}

main();
