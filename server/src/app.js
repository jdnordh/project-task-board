/**
 * app.js — the Express app and every /api route.
 *
 * Routes are ungated unless wrapped in `gated` (bearer token + localhost
 * Origin). Gated routes fail closed: no token configured → 401.
 */

import express from 'express';
import { HttpError } from './store.js';
import { scanRepos } from './repos.js';
import { IMAGE_MAX_BYTES } from './lib/images.js';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const FILE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

function originOk(req) {
  const o = req.headers.origin;
  return !o || LOCAL_ORIGIN.test(o);
}

export function createApp(store, { token = '', achievements = null } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const originOnly = (req, res, next) => (originOk(req) ? next() : res.status(403).json({ error: 'origin not allowed' }));
  const gated = (req, res, next) => {
    if (!originOk(req)) return res.status(403).json({ error: 'origin not allowed' });
    if (!token || req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: 'missing or wrong bearer token' });
    next();
  };
  /** Wrap a handler: sync errors become JSON responses. */
  const h = (fn, status = 200) => (req, res) => {
    try {
      const out = fn(req, res);
      if (res.headersSent) return;
      if (out === undefined) return res.status(204).end();
      res.status(status).json(out);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  };

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/state', h(() => store.getState()));

  app.post('/api/features', h((req) => store.createFeature(req.body), 201));
  app.patch('/api/features/:id', h((req) => store.updateFeature(req.params.id, req.body ?? {})));
  app.delete('/api/features/:id', h((req) => { store.deleteFeature(req.params.id); }));

  app.post('/api/tasks', h((req) => store.createTask(req.body), 201));
  app.patch('/api/tasks/:id', h((req) => store.updateTask(req.params.id, req.body)));
  app.delete('/api/tasks/:id', h((req) => { store.deleteTask(req.params.id); }));
  app.get('/api/tasks/:id', h((req) => store.agentView(req.params.id)));
  app.post('/api/tasks/:id/delegate', h((req) => store.delegateTask(req.params.id)));
  app.get('/api/agent-status', h(() => store.agentStatus()));
  app.post('/api/tasks/:id/agent', h((req) => store.setAgentStatus(req.params.id, req.body)));
  app.post('/api/tasks/:id/subtask', h((req) => store.setSubtask(req.params.id, req.body)));
  app.put('/api/tasks/:id/report', h((req) => store.setReport(req.params.id, req.body)));

  app.get('/api/tasks/:id/files', h((req) => store.filesFor(req.params.id)));
  app.post('/api/tasks/:id/files', gated, h((req) => store.linkFile(req.params.id, req.body), 201));
  app.delete('/api/task-files/:fid', originOnly, h((req) => { store.deleteFile(req.params.fid); }));
  app.get('/api/task-files/:fid', (req, res) => {
    if (!LOCAL_HOSTS.has(req.hostname)) return res.status(403).type('text/plain').send('Forbidden');
    try {
      const buf = store.fileContent(req.params.fid);
      res.set(FILE_HEADERS).send(buf);
    } catch (err) {
      res.status(err.status ?? 500).type('text/plain').send(err.message);
    }
  });

  app.post('/api/images', originOnly, express.raw({ type: () => true, limit: IMAGE_MAX_BYTES + 1024 }),
    h((req) => store.saveImage(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)), 201));
  app.get('/api/images/:id', (req, res) => {
    try {
      const img = store.imageContent(req.params.id);
      res.set({
        'Content-Type': img.mime,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=31536000, immutable',
      }).send(img.bytes);
    } catch (err) {
      res.status(err.status ?? 500).json({ error: err.message });
    }
  });
  app.get('/api/tasks/:id/images', h((req) => store.taskImages(req.params.id)));
  app.post('/api/tasks/:id/report-image', gated, h((req) => store.uploadReportImage(req.params.id, req.body), 201));

  app.get('/api/notes', h((req) => store.listNotes(req.query)));
  app.get('/api/notes/:id', h((req) => store.getNote(req.params.id)));
  app.post('/api/notes', h((req) => store.createNote(req.body), 201));
  app.patch('/api/notes/:id', h((req) => store.updateNote(req.params.id, req.body)));
  app.delete('/api/notes/:id', h((req) => { store.deleteNote(req.params.id); }));

  app.get('/api/task-templates', h(() => store.listTemplates()));
  app.post('/api/task-templates', h((req) => store.createTemplate(req.body), 201));
  app.patch('/api/task-templates/:id', h((req) => store.updateTemplate(req.params.id, req.body)));
  app.post('/api/task-templates/:id/used', h((req) => store.templateUsed(req.params.id)));
  app.delete('/api/task-templates/:id', h((req) => { store.deleteTemplate(req.params.id); }));

  app.get('/api/repos', h(() => scanRepos(store.getSettings().repos_base)));

  app.patch('/api/settings', h((req) => store.patchSettings(req.body)));

  if (achievements) {
    app.get('/api/achievements', h(() => achievements.view()));
    app.post('/api/achievements/check', h((req) => achievements.check(!!req.body?.action)));
    app.post('/api/achievements/seen', h((req) => achievements.markSeen(req.body?.ids)));
    app.post('/api/achievements/hint-seen', h((req) => achievements.hintSeen(req.body?.id)));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));
  // Body-parser errors (too large, bad JSON) as JSON with their status.
  app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
  return app;
}
