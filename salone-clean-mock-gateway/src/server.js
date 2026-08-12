// ============================================================================
// server.js — entrypoint for the mock API Gateway (local testing only).
// ============================================================================

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 4003;

app.listen(PORT, () => {
  console.log(`[mock-gateway] listening on port ${PORT}`);
  console.log(`[mock-gateway] health check: http://localhost:${PORT}/health`);
  console.log('[mock-gateway] ⚠ This is a LOCAL TESTING STAND-IN for the real API Gateway — not for production use.');
});
