// ============================================================================
// server.js — process entrypoint. Loads environment config and boots the
// HTTP server. Keep this file tiny; all real wiring lives in app.js.
// ============================================================================

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 4004;

app.listen(PORT, () => {
  console.log(`[driver-subsystem] listening on port ${PORT}`);
  console.log(`[driver-subsystem] health check: http://localhost:${PORT}/health`);
});
