/**
 * routes/subtasks.js — Express router for /api/subtasks.
 *
 * Endpoints:
 *   PATCH  /api/subtasks/:id  — update subtask label and/or checked state
 *   DELETE /api/subtasks/:id  — remove a subtask
 *
 * Note: Creation is handled by POST /api/tasks/:id/subtasks in tasks.js.
 * These endpoints operate on subtasks by their own ID for in-place updates and removal.
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

/**
 * PATCH /api/subtasks/:id
 * Body: { label?, checked? }
 * Updates the label and/or checked state of a subtask.
 */
router.patch('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const body = req.body || {};
    const updates = {};

    if (body.label !== undefined) {
      if (typeof body.label !== 'string' || !body.label.trim()) {
        return res.status(400).json({ errors: ['label must be a non-empty string'] });
      }
      updates.label = body.label.trim();
    }

    if (body.checked !== undefined) {
      updates.checked = body.checked ? 1 : 0;
    }

    if (Object.keys(updates).length === 0) {
      return res.json(existing);
    }

    const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    db.prepare(`UPDATE subtasks SET ${setClauses} WHERE id = ?`).run(...values);

    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
    res.json(subtask);
  } catch (err) {
    console.error('PATCH /api/subtasks/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/subtasks/:id
 * Removes a single subtask by its own ID.
 */
router.delete('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id FROM subtasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Subtask not found' });
    }
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/subtasks/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
