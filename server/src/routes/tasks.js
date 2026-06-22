/**
 * routes/tasks.js — Express router for /api/tasks.
 *
 * Endpoints:
 *   GET   /api/tasks        — list tasks, joined with project; optional ?projectIds=1,2,3
 *   POST  /api/tasks        — create a task
 *   PATCH /api/tasks/:id    — partial update; manages done_at on status transitions
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

/** Valid status values for the tasks table. */
const VALID_STATUSES = ['backlog', 'ready', 'in_progress', 'blocked', 'done'];

/**
 * GET /api/tasks
 * Returns all tasks with their project (id, name, color) joined.
 * Optional query param: ?projectIds=1,2,3 (comma-separated, OR logic).
 */
router.get('/', (req, res) => {
  try {
    const { projectIds } = req.query;

    let sql = `
      SELECT
        t.id,
        t.project_id,
        t.name,
        t.priority,
        t.notes,
        t.status,
        t.done_at,
        t.manual_adjustment_minutes,
        t.created_at,
        t.updated_at,
        p.name  AS project_name,
        p.color AS project_color
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
    `;

    let tasks;
    if (projectIds) {
      // Parse and sanitize to integers only
      const ids = projectIds
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      if (ids.length === 0) {
        return res.json([]);
      }

      const placeholders = ids.map(() => '?').join(', ');
      sql += ` WHERE t.project_id IN (${placeholders})`;
      tasks = db.prepare(sql).all(...ids);
    } else {
      tasks = db.prepare(sql).all();
    }

    res.json(tasks);
  } catch (err) {
    console.error('GET /api/tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks
 * Body: { name, project_id, priority?, status?, notes? }
 * Validates: name (required), project_id (required + must exist), priority (1–4), status.
 */
router.post('/', (req, res) => {
  try {
    const { name, project_id, priority = 2, status = 'backlog', notes } = req.body || {};
    const errors = [];

    if (!name || typeof name !== 'string' || !name.trim()) {
      errors.push('name is required');
    }
    if (!project_id) {
      errors.push('project_id is required');
    }
    const priorityNum = Number(priority);
    if (!Number.isInteger(priorityNum) || priorityNum < 1 || priorityNum > 4) {
      errors.push('priority must be an integer 1–4');
    }
    if (status && !VALID_STATUSES.includes(status)) {
      errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    if (errors.length) {
      return res.status(400).json({ errors });
    }

    // Verify project exists
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(project_id));
    if (!project) {
      return res.status(400).json({ errors: ['project_id does not reference an existing project'] });
    }

    const now = new Date().toISOString();
    const done_at = status === 'done' ? now : null;

    const result = db.prepare(`
      INSERT INTO tasks (project_id, name, priority, status, notes, done_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(Number(project_id), name.trim(), priorityNum, status, notes || null, done_at, now, now);

    const task = db.prepare(`
      SELECT t.*, p.name AS project_name, p.color AS project_color
      FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(task);
  } catch (err) {
    console.error('POST /api/tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/tasks/:id
 * Partial update of any task field.
 * Special logic: done_at is set when status transitions to 'done', cleared otherwise.
 * updated_at is always refreshed on every update.
 */
router.patch('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const body = req.body || {};
    const updates = {};

    // name
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return res.status(400).json({ errors: ['name must be a non-empty string'] });
      }
      updates.name = body.name.trim();
    }

    // project_id
    if (body.project_id !== undefined) {
      const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(Number(body.project_id));
      if (!project) {
        return res.status(400).json({ errors: ['project_id does not reference an existing project'] });
      }
      updates.project_id = Number(body.project_id);
    }

    // priority
    if (body.priority !== undefined) {
      const p = Number(body.priority);
      if (!Number.isInteger(p) || p < 1 || p > 4) {
        return res.status(400).json({ errors: ['priority must be an integer 1–4'] });
      }
      updates.priority = p;
    }

    // status + done_at transition logic
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return res.status(400).json({ errors: [`status must be one of: ${VALID_STATUSES.join(', ')}`] });
      }
      updates.status = body.status;

      if (body.status === 'done' && existing.status !== 'done') {
        updates.done_at = new Date().toISOString();
      } else if (body.status !== 'done') {
        updates.done_at = null;
      }
    }

    // notes
    if (body.notes !== undefined) {
      updates.notes = body.notes || null;
    }

    // manual_adjustment_minutes
    if (body.manual_adjustment_minutes !== undefined) {
      updates.manual_adjustment_minutes = Number(body.manual_adjustment_minutes) || 0;
    }

    // Always refresh updated_at
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length === 1) {
      // Only updated_at changed — nothing meaningful to do but still return current state
      const task = db.prepare(`
        SELECT t.*, p.name AS project_name, p.color AS project_color
        FROM tasks t JOIN projects p ON p.id = t.project_id
        WHERE t.id = ?
      `).get(id);
      return res.json(task);
    }

    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    db.prepare(`UPDATE tasks SET ${setClauses} WHERE id = ?`).run(...values);

    const task = db.prepare(`
      SELECT t.*, p.name AS project_name, p.color AS project_color
      FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
    `).get(id);

    res.json(task);
  } catch (err) {
    console.error('PATCH /api/tasks/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
