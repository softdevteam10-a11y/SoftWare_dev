// ============================================================================
// gatewayClient.js — The ONLY place this subsystem is allowed to reach
// outward toward the rest of the Salone Clean platform (Driver Subsystem,
// Management Subsystem, mobile money rails). Everything goes through the
// shared API Gateway over plain HTTPS + a service key — never a direct
// database connection, never a direct service-to-service call.
// ============================================================================

const fetch = require('node-fetch');

const GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL || 'https://gateway.saloneclean.sl/api/v1';
const GATEWAY_SERVICE_KEY = process.env.API_GATEWAY_SERVICE_KEY || '';

/**
 * Forward a mobile-money payment initialization request to the API Gateway.
 * The Gateway is responsible for actually talking to Orange Money / Africell
 * Money and for notifying the Management Subsystem once payment clears.
 *
 * @param {object} payload - transaction payload (see routes/paymentRoutes.js)
 * @returns {Promise<{ok: boolean, status: number, body: object}>}
 */
async function initializeGatewayPayment(payload) {
  const url = `${GATEWAY_BASE_URL}/payments/initialize`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Service-Key': GATEWAY_SERVICE_KEY,
        'X-Origin-Subsystem': 'customer-subsystem',
      },
      body: JSON.stringify(payload),
      timeout: 45000, // generous headroom for Render free-tier cold starts on the downstream service
    });

    let body = {};
    try {
      body = await response.json();
    } catch (_) {
      // Gateway may return an empty body on some error paths — that's fine.
    }

    return { ok: response.ok, status: response.status, body };
  } catch (networkError) {
    // The Gateway is unreachable (DNS, timeout, connection refused, etc).
    // We surface this distinctly from a Gateway-returned business error.
    return {
      ok: false,
      status: 502,
      body: { code: 'GATEWAY_UNREACHABLE', message: networkError.message },
    };
  }
}

module.exports = { initializeGatewayPayment, GATEWAY_BASE_URL };
