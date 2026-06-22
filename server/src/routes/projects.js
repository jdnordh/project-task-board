/**
 * projects.js — Express router for /api/projects.
 *
 * Endpoints:
 *   GET    /api/projects        — list all projects ordered by created_at DESC
 *   POST   /api/projects        — create a project
 *   PATCH  /api/projects/:id    — update name, color, billable, completed
 *   DELETE /api/projects/:id    — cascade delete; returns deleted task count
 */

const express = require('express');
const db = require('../db');

const router = express.Router();

/** 12 preset project colors — the only valid values for the color field. */
const PROJECT_COLORS = [
  '#3B82F6', // blue
  '#06B6D4', // cyan
  '#10B981', // emerald
  '#84CC16', // lime
  '#EAB308', // yellow
  '#F97316', // orange
  '#EF4444', // red
  '#EC4899', // pink
  '#A855F7', // purple
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#F59E0B', // amber
];

module.exports = { router, PROJECT_COLORS };

/**
 * GET /api/projects
 * Returns all projects ordered by created_at DESC.
 * Augments each project with its task count and done task count.
 */
router.get('/', (_req, res) => {
  const projects = db.prepare(`
    SELECT
      p.*,
      COUNT(t.id)                           AS task_count,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();

  // Normalise SQLite integers to JS booleans
  const result = projects.map((p) => ({
    ...p,
    billable: p.billable === 1 || p.billable === true,
    completed: p.completed === 1 || p.completed === true,
    task_count: Number(p.task_count) || 0,
    done_count: Number(p.done_count) || 0,
  }));

  res.json(result);
});

/**
 * POST /api/projects
 * Body: { name: string, color: string, billable: boolean }
 * Returns the created project row.
 */
router.post('/', (req, res) => {
  const { name, color, billable } = req.body;

  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('name is required');
  }
  if (!color || !PROJECT_COLORS.includes(color)) {
    errors.push(`color must be one of: ${PROJECT_COLORS.join(', ')}`);
  }
  if (billable !== undefined && typeof billable !== 'boolean') {
    errors.push('billable must be a boolean');
  }
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const result = db.prepare(
    'INSERT INTO projects (name, color, billable) VALUES (?, ?, ?)'
  ).run(name.trim(), color, billable ? 1 : 0);

  const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    ...created,
    billable: created.billable === 1,
    completed: created.completed === 1,
    task_count: 0,
    done_count: 0,
  });
});

/**
 * PATCH /api/projects/:id
 * Body: partial { name?, color?, billable?, completed? }
 * Returns the updated project row.
 */
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { name, color, billable, completed } = req.body;
  const errors = [];

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    errors.push('name must be a non-empty string');
  }
  if (color !== undefined && !PROJECT_COLORS.includes(color)) {
    errors.push(`color must be one of: ${PROJECT_COLORS.join(', ')}`);
  }
  if (billable !== undefined && typeof billable !== 'boolean') {
    errors.push('billable must be a boolean');
  }
  if (completed !== undefined && typeof completed !== 'boolean') {
    errors.push('completed must be a boolean');
  }
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const newName      = name      !== undefined ? name.trim()      : existing.name;
  const newColor     = color     !== undefined ? color            : existing.color;
  const newBillable  = billable  !== undefined ? (billable ? 1 : 0) : existing.billable;
  const newCompleted = completed !== undefined ? (completed ? 1 : 0) : existing.completed;

  db.prepare(
    'UPDATE projects SET name = ?, color = ?, billable = ?, completed = ? WHERE id = ?'
  ).run(newName, newColor, newBillable, newCompleted, id);

  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  const taskRow = db.prepare(
    'SELECT COUNT(*) AS task_count, SUM(CASE WHEN status = \'done\' THEN 1 ELSE 0 END) AS done_count FROM tasks WHERE project_id = ?'
  ).get(id);

  res.json({
    ...updated,
    billable: updated.billable === 1,
    completed: updated.completed === 1,
    task_count: Number(taskRow.task_count) || 0,
    done_count: Number(taskRow.done_count) || 0,
  });
});

/**
 * DELETE /api/projects/:id
 * Cascades to all child tasks (and their subtasks, blocked_reasons, time_sessions via FK).
 * Returns { deleted_task_count: number }.
 */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { task_count } = db.prepare(
    'SELECT COUNT(*) AS task_count FROM tasks WHERE project_id = ?'
  ).get(id);

  db.prepare('DELETE FROM projects WHERE id = ?').run(id);

  res.json({ deleted_task_count: Number(task_count) || 0 });
});
