/**
 * client.js — what the Grove MCP servers share: REST calls to the local
 * server (never SQLite), tool-result helpers and the note/image tools.
 * `.env` is re-read on every call.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { REPO_ROOT, readEnv } from '../src/env.js';
import { IMAGE_EXT_BY_MIME } from '../src/lib/images.js';
import { findFeature } from '../src/lib/buddy.js';
import { noteLine, formatNote } from './format.js';

export const REPO = REPO_ROOT.replace(/\\/g, '/');

function port() {
  return Number(readEnv().PORT) || 3004;
}

async function send(method, url, body, bearer) {
  const env = readEnv();
  const headers = { 'Content-Type': 'application/json' };
  if (bearer && env.GROVE_TOKEN) headers.Authorization = `Bearer ${env.GROVE_TOKEN}`;
  try {
    return await fetch(`http://localhost:${port()}${url}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Grove is not running at localhost:${port()}. Ask the user to start it (npm run dev in ${REPO}).`);
  }
}

/** JSON request; a non-2xx status throws with the server's error message. */
export async function call(method, url, body, { bearer = false } = {}) {
  const res = await send(method, url, body, bearer);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/** Raw bytes of a GET (images, linked files). */
export async function getBytes(url) {
  const res = await send('GET', url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export const text = (s) => ({ content: [{ type: 'text', text: s }] });

/** Run a tool body; turn failures into a readable tool error. */
export const tool = (fn) => async (args) => {
  try {
    return text(await fn(args));
  } catch (err) {
    return { ...text(err.message), isError: true };
  }
};

export const taskId = z.string().min(1).describe('The Grove task id, e.g. tmh2k3x1');
const enc = encodeURIComponent;

/** Meeting-note tools, shared by grove-agent and grove-buddy. */
export function registerNoteTools(server) {
  server.registerTool('search_meeting_notes', {
    description: 'Search meeting notes. No q → notes from the last 14 days; with q → every word must match, across all dates. One line per note with open action items and an excerpt.',
    inputSchema: {
      q: z.string().optional(),
      from: z.string().optional().describe('YYYY-MM-DD, meeting date on or after'),
      to: z.string().optional().describe('YYYY-MM-DD, meeting date on or before'),
      feature: z.string().optional().describe('Feature id or name, or "none" for notes without a feature'),
    },
  }, tool(async ({ q, from, to, feature }) => {
    const state = await call('GET', '/api/state');
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (feature) {
      const f = feature === 'none' ? { id: 'none' } : findFeature(feature, state.features);
      if (!f) throw new Error(`Unknown feature "${feature}". Features: ${state.features.map((x) => x.name).join(', ')}`);
      params.set('feature', f.id);
    }
    const rows = await call('GET', `/api/notes?${params}`);
    const names = new Map(state.features.map((f) => [f.id, f.name]));
    if (!rows.length) return q ? `No notes match "${q}".` : 'No meeting notes in that range.';
    return rows.map((n) => noteLine(n, names.get(n.feature_id))).join('\n');
  }));

  server.registerTool('get_meeting_note', {
    description: 'Read one meeting note: title, date, feature, the text with [ ] / [x] action items, then the transcript.',
    inputSchema: { id: z.string().min(1) },
  }, tool(async ({ id }) => formatNote(await call('GET', `/api/notes/${enc(id)}`))));
}

/** Picture tools for workers. */
export function registerImageTools(server) {
  server.registerTool('get_task_images', {
    description: 'Save the pictures in a task\'s description ([image] in the text) as files and return their paths, in order. Open them to see them.',
    inputSchema: { task_id: taskId, save_to_dir: z.string().optional().describe('Folder to save into; default a temp folder') },
  }, tool(async ({ task_id, save_to_dir }) => {
    const list = await call('GET', `/api/tasks/${enc(task_id)}/images`);
    if (!list.length) return 'This task has no pictures.';
    const dir = path.resolve(save_to_dir || path.join(os.tmpdir(), 'grove-images', task_id));
    fs.mkdirSync(dir, { recursive: true });
    const saved = [];
    for (const [i, img] of list.entries()) {
      const file = path.join(dir, `${i + 1}-${img.id}.${IMAGE_EXT_BY_MIME[img.mime] ?? 'img'}`);
      fs.writeFileSync(file, await getBytes(img.url));
      saved.push(file);
    }
    return `Saved ${saved.length} picture(s), in description order:\n${saved.join('\n')}`;
  }));

  server.registerTool('upload_report_image', {
    description: 'Upload a local picture (.png, .jpg, .gif, .webp, up to 5 MB) for your report. Returns the markdown line to put in the report.',
    inputSchema: { task_id: taskId, path: z.string().describe('Absolute path to the picture'), caption: z.string().max(200).optional() },
  }, tool(async ({ task_id, path: p, caption }) => {
    const r = await call('POST', `/api/tasks/${enc(task_id)}/report-image`, { path: p, caption }, { bearer: true });
    return `Uploaded. Put this line in your report: ${r.markdown}`;
  }));
}
