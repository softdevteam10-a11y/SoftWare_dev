// ============================================================================
// apiResponse.js — Standardized JSON envelope for every response this
// subsystem returns, so the frontend (and API Gateway) can rely on one shape.
// ============================================================================

/**
 * Success envelope: { success: true, data, message }
 */
function sendSuccess(res, { data = null, message = 'OK', statusCode = 200 } = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Error envelope: { success: false, error: { code, message, details } }
 * `code` is a short machine-readable string, `details` is optional
 * (e.g. field-level validation errors).
 */
function sendError(res, { statusCode = 400, code = 'BAD_REQUEST', message = 'Request could not be processed.', details = null } = {}) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

module.exports = { sendSuccess, sendError };
