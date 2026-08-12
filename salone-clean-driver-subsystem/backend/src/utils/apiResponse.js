// ============================================================================
// apiResponse.js — Standardized JSON envelope, consistent with the Customer
// and Management subsystems. In this API-only backend, this module IS the
// "View" layer of MVC: it's the one place response shape is decided,
// separate from Model (data access) and Controller (request handling).
// ============================================================================

function sendSuccess(res, { data = null, message = 'OK', statusCode = 200 } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}

function sendError(res, { statusCode = 400, code = 'BAD_REQUEST', message = 'Request could not be processed.', details = null } = {}) {
  return res.status(statusCode).json({ success: false, error: { code, message, details } });
}

module.exports = { sendSuccess, sendError };
