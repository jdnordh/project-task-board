/**
 * routes/sessions.js — Express router for /api/sessions.
 *
 * Endpoints:
 *   POST /api/sessions/heartbeat    — record last-seen timestamp for an open session
 *   POST /api/sessions/close-stale  — close open sessions with no recent heartbeat
 *
 * Heartbeats are tracked in an in-memory Map (heartbeatMap) keyed by taskId.
 * The Map is wiped when the server restarts, but the startup stale-close in
 * db.js already handles sessions left open from a previous run.
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * In-memory map: taskId (number) → Date of last heartbeat received.
 * Not persisted across restarts — server startup in db.js handles that case.
 */
const heartbeatMap = new Map();

/** Stale threshold: close sessions whose last heartbeat is older than this. */
const STALE_THRESHOLD_MS = 60 * 1000; // 60 seconds

/**
 * POST /api/sessions/heartbeat
 * Body: { taskId: number }
 * Records the current timestamp for the given taskId in heartbeatMap.
 * Returns 200 { ok: true }.
 */
router.post('/heartbeat', (req, res) => {
  try {
    const { taskId } = req.body || {};
    if (!taskId || typeof taskId !== 'number') {
      return res.status(400).json({ error: 'taskId (number) is required' });
    }
    heartbeatMap.set(taskId, new Date());
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/sessions/heartbeat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/sessions/close-stale
 * Closes any open time_sessions rows where:
 *   - The heartbeatMap has no entry for the task_id, OR
 *   - The last heartbeat is older than STALE_THRESHOLD_MS.
 * Called by the client's beforeunload beacon and can be called manually.
 * Returns 200 { closed: number } with the count of sessions closed.
 */
router.post('/close-stale', (req, res) => {
  try {
    const openSessions = db
      .prepare('SELECT id, task_id, started_at FROM time_sessions WHERE ended_at IS NULL')
      .all();

    const now = Date.now();
    let closed = 0;

    for (const session of openSessions) {
      const lastBeat = heartbeatMap.get(session.task_id);
      const isStale = !lastBeat || now - lastBeat.getTime() > STALE_THRESHOLD_MS;

      if (isStale) {
        db.prepare(`
          UPDATE time_sessions
          SET ended_at = datetime('now'),
              minutes = MAX(1, CAST((julianday('now') - julianday(started_at)) * 1440 AS INTEGER))
          WHERE id = ?
        `).run(session.id);
        heartbeatMap.delete(session.task_id);
        closed++;
      }
    }

    res.json({ closed });
  } catch (err) {
    console.error('POST /api/sessions/close-stale error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
