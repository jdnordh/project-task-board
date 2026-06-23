/**
 * routes/tasks.js — Express router for /api/tasks.
 *
 * Endpoints:
 *   GET    /api/tasks                        — list tasks, joined with project; optional ?projectIds=1,2,3
 *   POST   /api/tasks                        — create a task
 *   GET    /api/tasks/:id                    — single task with subtasks and session_minutes
 *   PATCH  /api/tasks/:id                    — partial update; manages done_at on status transitions
 *   DELETE /api/tasks/:id                    — delete task (cascades subtasks, blocked_reasons, time_sessions)
 *   POST   /api/tasks/:id/subtasks           — create a subtask under a task
 *   DELETE /api/tasks/:id/subtasks           — delete all subtasks (replace-all helper)
 *   POST   /api/tasks/:id/blocked-reasons    — add a blocked reason row for a task
 *   GET    /api/tasks/:id/blocked-reasons    — return all blocked reasons for a task, newest first
 */

const express = require('express');
const db = require('../db');

const router = express.Router({ mergeParams: true });

/** Valid status values for the tasks table. */
const VALID_STATUSES = ['backlog', 'ready', 'in_progress', 'blocked', 'done'];

/**
 * GET /api/tasks
 * Returns all tasks with their project (id, name, color) joined, plus
 * latest_blocked_reason from the most recent blocked_reasons row per task.
 * Optional query params:
 *   ?projectId=N        — returns ALL tasks for one project (no age filter); used by Project Detail.
 *   ?projectIds=1,2,3   — OR filter across multiple projects; used by the Board's filter pills.
 */
router.get('/', (req, res) => {
  try {
    const { projectIds, projectId } = req.query;

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
        p.name    AS project_name,
        p.color   AS project_color,
        p.billable AS project_billable,
        br.reason AS latest_blocked_reason
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN blocked_reasons br
        ON br.task_id = t.id
        AND br.id = (
          SELECT id FROM blocked_reasons
          WHERE task_id = t.id
          ORDER BY created_at DESC
          LIMIT 1
        )
    `;

    let tasks;
    if (projectId !== undefined) {
      // Singular ?projectId=N — returns ALL tasks for one project, no status/age filter.
      // Used by the Project Detail page to show full task history including old done tasks.
      const id = parseInt(String(projectId), 10);
      if (isNaN(id)) {
        return res.json([]);
      }
      sql += ` WHERE t.project_id = ? ORDER BY t.created_at ASC`;
      tasks = db.prepare(sql).all(id);
    } else if (projectIds) {
      // Plural ?projectIds=1,2,3 — OR filter for the Board's project filter pills.
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
    const { name, project_id, priority = 2, status = 'ready', notes } = req.body || {};
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
 * GET /api/tasks/:id
 * Returns a single task with project info, subtasks array, and session_minutes
 * (sum of time_sessions.minutes for auto-tracked time).
 */
router.get('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const task = db.prepare(`
      SELECT t.*, p.name AS project_name, p.color AS project_color, p.billable AS project_billable
      FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
    `).get(id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY id').all(id);

    const sessionRow = db.prepare(
      'SELECT COALESCE(SUM(minutes), 0) AS total FROM time_sessions WHERE task_id = ? AND minutes IS NOT NULL'
    ).get(id);

    res.json({ ...task, subtasks, session_minutes: sessionRow.total });
  } catch (err) {
    console.error('GET /api/tasks/:id error:', err);
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

/**
 * DELETE /api/tasks/:id
 * Permanently removes the task. FK ON DELETE CASCADE removes subtasks,
 * blocked_reasons, and time_sessions automatically.
 */
router.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/tasks/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks/:id/subtasks
 * Body: { label, checked? }
 * Creates a subtask under the given task.
 */
router.post('/:id/subtasks', (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { label, checked = false } = req.body || {};
    if (!label || typeof label !== 'string' || !label.trim()) {
      return res.status(400).json({ errors: ['label is required'] });
    }

    const result = db.prepare(
      'INSERT INTO subtasks (task_id, label, checked) VALUES (?, ?, ?)'
    ).run(taskId, label.trim(), checked ? 1 : 0);

    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(subtask);
  } catch (err) {
    console.error('POST /api/tasks/:id/subtasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/tasks/:id/subtasks
 * Removes ALL subtasks for the task. Used by the replace-all sync strategy on drawer save.
 */
router.delete('/:id/subtasks', (req, res) => {
  try {
    const taskId = Number(req.params.id);
    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(taskId);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/tasks/:id/subtasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks/:id/blocked-reasons
 * Body: { reason: string }
 * Creates a new blocked_reason row for the given task. Each call appends to
 * history — existing rows are never overwritten.
 * Returns the newly created row.
 */
router.post('/:id/blocked-reasons', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { reason } = req.body || {};
    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ errors: ['reason is required and must be a non-empty string'] });
    }

    const now = new Date().toISOString();
    const result = db
      .prepare('INSERT INTO blocked_reasons (task_id, reason, created_at) VALUES (?, ?, ?)')
      .run(id, reason.trim(), now);

    const row = db
      .prepare('SELECT * FROM blocked_reasons WHERE id = ?')
      .get(result.lastInsertRowid);

    res.status(201).json(row);
  } catch (err) {
    console.error('POST /api/tasks/:id/blocked-reasons error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/tasks/:id/blocked-reasons
 * Returns all blocked_reason rows for the given task, ordered by created_at DESC
 * (most recent first). Returns an empty array if none exist.
 */
router.get('/:id/blocked-reasons', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const rows = db
      .prepare('SELECT * FROM blocked_reasons WHERE task_id = ? ORDER BY created_at DESC')
      .all(id);

    res.json(rows);
  } catch (err) {
    console.error('GET /api/tasks/:id/blocked-reasons error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks/:id/sessions/start
 * Opens a new time session for the given task.
 * Validates: task exists (404); project is billable (400); no open session already (400).
 * Returns 201 with the new time_sessions row.
 */
router.post('/:id/sessions/start', (req, res) => {
  try {
    const id = Number(req.params.id);

    // Verify task + project exist and project is billable
    const task = db.prepare(`
      SELECT t.id, p.billable AS project_billable
      FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
    `).get(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (!task.project_billable) {
      return res.status(400).json({ error: 'Project is not billable; time tracking is disabled' });
    }

    // Idempotency guard: reject if an open session already exists
    const open = db.prepare(
      'SELECT id FROM time_sessions WHERE task_id = ? AND ended_at IS NULL'
    ).get(id);
    if (open) {
      return res.status(400).json({ error: 'An open session already exists for this task' });
    }

    const now = new Date().toISOString();
    const result = db.prepare(
      'INSERT INTO time_sessions (task_id, started_at, ended_at, minutes) VALUES (?, ?, NULL, NULL)'
    ).run(id, now);

    const session = db.prepare('SELECT * FROM time_sessions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(session);
  } catch (err) {
    console.error('POST /api/tasks/:id/sessions/start error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/tasks/:id/sessions/end
 * Closes the open time session for the given task.
 * If no open session exists, returns 200 { closed: false } (no-op).
 * Otherwise closes it and returns 200 { closed: true, session }.
 */
router.post('/:id/sessions/end', (req, res) => {
  try {
    const id = Number(req.params.id);

    const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const open = db.prepare(
      'SELECT * FROM time_sessions WHERE task_id = ? AND ended_at IS NULL'
    ).get(id);
    if (!open) {
      return res.json({ closed: false });
    }

    db.prepare(`
      UPDATE time_sessions
      SET ended_at = datetime('now'),
          minutes = MAX(1, CAST((julianday('now') - julianday(started_at)) * 1440 AS INTEGER))
      WHERE id = ?
    `).run(open.id);

    const session = db.prepare('SELECT * FROM time_sessions WHERE id = ?').get(open.id);
    res.json({ closed: true, session });
  } catch (err) {
    console.error('POST /api/tasks/:id/sessions/end error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
