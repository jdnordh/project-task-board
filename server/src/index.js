/**
 * index.js — Express application entry point.
 *
 * Initialises the database (via db.js import) then starts an HTTP server
 * on port 3001. The Vite dev server proxies /api/* to this port.
 */

const express = require('express');

// Import db singleton to trigger schema initialisation on startup.
require('./db');

const app = express();
const PORT = 3001;

app.use(express.json());

/**
 * GET /api/health
 * Liveness check — returns { ok: true }.
 */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
