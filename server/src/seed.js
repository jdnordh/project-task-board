/**
 * seed.js — Inserts sample projects and tasks for visual testing.
 *
 * Run once: node server/src/seed.js
 * Safe to re-run: clears existing data first (projects cascade-deletes tasks).
 */

const db = require('./db');

// Clear existing data
db.exec('DELETE FROM projects');
// Tasks are cascade-deleted by FK

// Insert projects
const projStmt = db.prepare(
  'INSERT INTO projects (name, color, billable) VALUES (?, ?, ?)'
);

const p1 = projStmt.run('Grove App', '#10B981', 1);
const p2 = projStmt.run('Marketing Site', '#3B82F6', 0);
const p3 = projStmt.run('Internal Tools', '#A855F7', 1);

const p1id = p1.lastInsertRowid;
const p2id = p2.lastInsertRowid;
const p3id = p3.lastInsertRowid;

// Insert tasks
const taskStmt = db.prepare(`
  INSERT INTO tasks (project_id, name, priority, status, notes, done_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const now = new Date().toISOString();
const recent = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago (within 72h)

// Backlog tasks
taskStmt.run(p1id, 'Set up authentication flow', 2, 'backlog', 'OAuth2 + JWT', null, now, now);
taskStmt.run(p2id, 'Write landing page copy', 3, 'backlog', null, null, now, now);
taskStmt.run(p3id, 'Migrate legacy data export', 4, 'backlog', 'CSV + JSON format', null, now, now);

// Ready tasks
taskStmt.run(p1id, 'Design task card component', 1, 'ready', null, null, now, now);
taskStmt.run(p2id, 'Implement contact form', 2, 'ready', null, null, now, now);

// In Progress tasks
taskStmt.run(p1id, 'Board page drag-and-drop', 1, 'in-progress', 'Using dnd-kit', null, now, now);
taskStmt.run(p3id, 'Build admin dashboard', 2, 'in-progress', null, null, now, now);

// Blocked tasks
taskStmt.run(p1id, 'Deploy to staging', 2, 'blocked', 'Waiting for DevOps access', null, now, now);

// Done tasks (within 72h)
taskStmt.run(p1id, 'Set up Express server', 1, 'done', null, recent, now, now);
taskStmt.run(p2id, 'Design system tokens', 2, 'done', null, recent, now, now);

console.log('Seed complete: 3 projects, 10 tasks inserted.');
