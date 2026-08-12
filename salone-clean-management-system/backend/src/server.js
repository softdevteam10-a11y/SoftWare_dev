// ============================================================================
// server.js — process entrypoint. Loads environment config and boots the
// HTTP server. Keep this file tiny; all real wiring lives in app.js.
// ============================================================================

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 4002;

app.listen(PORT, () => {
  console.log(`[management-subsystem] listening on port ${PORT}`);
  console.log(`[management-subsystem] health check: http://localhost:${PORT}/health`);
});
