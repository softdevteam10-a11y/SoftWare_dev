// ============================================================================
// validators.js — Lightweight, dependency-free request validation.
// Each validator is Express middleware: it either calls next(), or responds
// with a standardized 422 error and stops the chain.
// ============================================================================

const { sendError } = require('../utils/apiResponse');

const VALID_SUBSYSTEMS = ['CUSTOMER', 'DRIVER', 'ALL'];
const VALID_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];
const VALID_EXPORT_FORMATS = ['JSON', 'MOCK_PDF'];

/** Panel 2: validate a "Deploy Global Route Update" payload. */
function validateRouteDeployment(req, res, next) {
  const { admin_user_id, target_subsystem, config_payload } = req.body || {};
  const errors = [];

  if (!admin_user_id || typeof admin_user_id !== 'string') {
    errors.push({ field: 'admin_user_id', message: 'admin_user_id is required to attribute this action.' });
  }
  if (!VALID_SUBSYSTEMS.includes(target_subsystem)) {
    errors.push({ field: 'target_subsystem', message: `target_subsystem must be one of: ${VALID_SUBSYSTEMS.join(', ')}.` });
  }
  if (!config_payload || typeof config_payload !== 'object') {
    errors.push({ field: 'config_payload', message: 'config_payload (object) describing the route update is required.' });
  }

  if (errors.length > 0) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'Some deployment fields need attention.', details: errors });
  }
  next();
}

/** Panel 3: validate an audit report generation request. */
function validateAuditReportRequest(req, res, next) {
  const { admin_user_id, target_subsystem, start_date, end_date, export_format } = req.body || {};
  const errors = [];

  if (!admin_user_id || typeof admin_user_id !== 'string') {
    errors.push({ field: 'admin_user_id', message: 'admin_user_id is required to attribute this action.' });
  }
  if (!VALID_SUBSYSTEMS.includes(target_subsystem)) {
    errors.push({ field: 'target_subsystem', message: `target_subsystem must be one of: ${VALID_SUBSYSTEMS.join(', ')}.` });
  }
  if (!start_date || isNaN(Date.parse(start_date))) {
    errors.push({ field: 'start_date', message: 'A valid start_date (ISO date) is required.' });
  }
  if (!end_date || isNaN(Date.parse(end_date))) {
    errors.push({ field: 'end_date', message: 'A valid end_date (ISO date) is required.' });
  }
  if (start_date && end_date && !isNaN(Date.parse(start_date)) && !isNaN(Date.parse(end_date)) && new Date(start_date) > new Date(end_date)) {
    errors.push({ field: 'start_date', message: 'start_date must be before end_date.' });
  }
  if (!VALID_EXPORT_FORMATS.includes(export_format)) {
    errors.push({ field: 'export_format', message: `export_format must be one of: ${VALID_EXPORT_FORMATS.join(', ')}.` });
  }

  if (errors.length > 0) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'Some report fields need attention.', details: errors });
  }
  next();
}

module.exports = { validateRouteDeployment, validateAuditReportRequest, VALID_SUBSYSTEMS, VALID_SEVERITIES, VALID_EXPORT_FORMATS };
