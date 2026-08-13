// ============================================================================
// timeouts.js — Shared fetch timeout for calls to other subsystems.
//
// Render's free tier spins down idle services; the first request after a
// period of inactivity can take 30-50 seconds to wake one back up. A short
// timeout (the previous 5-10s here) aborts before the service even finishes
// waking, which looks identical to "service is down" from the caller's side
// and is a common source of confusing intermittent failures on Render.
// 45 seconds gives comfortable headroom for a cold start while still
// eventually failing if a service is genuinely unreachable.
// ============================================================================

const CROSS_SERVICE_TIMEOUT_MS = 45000;

module.exports = { CROSS_SERVICE_TIMEOUT_MS };
