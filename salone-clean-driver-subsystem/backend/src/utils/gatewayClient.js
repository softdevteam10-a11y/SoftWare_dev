// ============================================================================
// gatewayClient.js — The ONLY place this subsystem is allowed to reach
// outward toward the rest of the Salone Clean platform. Everything goes
// through the shared API Gateway over HTTPS + a service key — never a
// direct database connection or direct service-to-service call.
//
// This is a thin infrastructure wrapper, deliberately free of business
// logic, so that GatewayDispatchObserver (see patterns/observers) can
// depend on this abstraction rather than on fetch/HTTP details directly —
// Dependency Inversion in practice.
// ============================================================================

const fetch = require('node-fetch');

const GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL || 'https://gateway.saloneclean.sl/api/v1';
const GATEWAY_SERVICE_KEY = process.env.API_GATEWAY_SERVICE_KEY || '';

/**
 * @param {string} gatewayPath - path under the gateway base, e.g. '/driver-events/dispatch'
 * @param {object} payload
 * @returns {Promise<{ok: boolean, status: number, body: object}>}
 */
async function postToGateway(gatewayPath, payload) {
  const url = `${GATEWAY_BASE_URL}${gatewayPath}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Service-Key': GATEWAY_SERVICE_KEY,
        'X-Origin-Subsystem': 'driver-subsystem',
      },
      body: JSON.stringify(payload),
      timeout: 8000,
    });

    let body = {};
    try { body = await response.json(); } catch (_) { /* some gateway responses may be empty */ }

    return { ok: response.ok, status: response.status, body };
  } catch (networkError) {
    return { ok: false, status: 502, body: { code: 'GATEWAY_UNREACHABLE', message: networkError.message } };
  }
}

module.exports = { postToGateway, GATEWAY_BASE_URL };
