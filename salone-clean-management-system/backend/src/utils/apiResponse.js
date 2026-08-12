// ============================================================================
// apiResponse.js — Standardized JSON envelope for every response, so the
// dashboard (and the API Gateway) can rely on one shape across subsystems.
// ============================================================================

function sendSuccess(res, { data = null, message = 'OK', statusCode = 200 } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}

function sendError(res, { statusCode = 400, code = 'BAD_REQUEST', message = 'Request could not be processed.', details = null } = {}) {
  return res.status(statusCode).json({ success: false, error: { code, message, details } });
}

module.exports = { sendSuccess, sendError };
