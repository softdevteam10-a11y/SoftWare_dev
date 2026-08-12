// ============================================================================
// gatewayClient.js — The ONLY place this subsystem is allowed to reach
// outward toward the rest of the Salone Clean platform (Customer Subsystem,
// Driver Subsystem). Everything goes through the shared API Gateway over
// HTTPS + a service key — never a direct database connection.
// ============================================================================

const fetch = require('node-fetch');

const GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL || 'https://gateway.saloneclean.sl/api/v1';
const GATEWAY_SERVICE_KEY = process.env.API_GATEWAY_SERVICE_KEY || '';

/**
 * Generic authenticated POST to the API Gateway. Used for things like
 * broadcasting a global route-update configuration to the Driver Subsystem.
 *
 * @param {string} gatewayPath - path under the gateway base, e.g. '/routes/broadcast'
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
        'X-Origin-Subsystem': 'management-subsystem',
      },
      body: JSON.stringify(payload),
      timeout: 10000,
    });

    let body = {};
    try { body = await response.json(); } catch (_) { /* some gateway responses may be empty */ }

    return { ok: response.ok, status: response.status, body };
  } catch (networkError) {
    // Gateway unreachable (DNS, timeout, connection refused, etc). Distinguish
    // this from a Gateway-returned business error so callers can react correctly.
    return { ok: false, status: 502, body: { code: 'GATEWAY_UNREACHABLE', message: networkError.message } };
  }
}

module.exports = { postToGateway, GATEWAY_BASE_URL };
