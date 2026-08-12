// ============================================================================
// apiResponse.js — Same { success, data|error } envelope used by the real
// subsystems, so this mock behaves like the real Gateway would.
// ============================================================================

function sendSuccess(res, { data = null, message = 'OK', statusCode = 200 } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}

function sendError(res, { statusCode = 400, code = 'BAD_REQUEST', message = 'Request could not be processed.', details = null } = {}) {
  return res.status(statusCode).json({ success: false, error: { code, message, details } });
}

module.exports = { sendSuccess, sendError };
