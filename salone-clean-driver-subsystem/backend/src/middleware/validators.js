// ============================================================================
// validators.js — Lightweight, dependency-free request validation.
// Each validator is Express middleware: it either calls next(), or responds
// with a standardized 422 error and stops the chain.
// ============================================================================

const { sendError } = require('../utils/apiResponse');
const DriverTask = require('../models/DriverTask');
const Alert = require('../models/Alert');

function validateTaskStatusUpdate(req, res, next) {
  const { status, notes } = req.body || {};
  const errors = [];

  if (!status || !DriverTask.VALID_STATUSES.includes(status)) {
    errors.push({ field: 'status', message: `status must be one of: ${DriverTask.VALID_STATUSES.join(', ')}.` });
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    errors.push({ field: 'notes', message: 'notes must be a string if provided.' });
  }

  if (errors.length > 0) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'Invalid task status update.', details: errors });
  }
  next();
}

function validateLocationPing(req, res, next) {
  const { driver_id, latitude, longitude } = req.body || {};
  const errors = [];

  if (!driver_id || typeof driver_id !== 'string') {
    errors.push({ field: 'driver_id', message: 'driver_id is required.' });
  }
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
    errors.push({ field: 'latitude', message: 'latitude must be a number between -90 and 90.' });
  }
  if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
    errors.push({ field: 'longitude', message: 'longitude must be a number between -180 and 180.' });
  }

  if (errors.length > 0) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'Invalid location ping.', details: errors });
  }
  next();
}

function validateAlert(req, res, next) {
  const { driver_id, alert_type } = req.body || {};
  const errors = [];

  if (!driver_id || typeof driver_id !== 'string') {
    errors.push({ field: 'driver_id', message: 'driver_id is required.' });
  }
  if (!alert_type || !Alert.VALID_ALERT_TYPES.includes(alert_type)) {
    errors.push({ field: 'alert_type', message: `alert_type must be one of: ${Alert.VALID_ALERT_TYPES.join(', ')}.` });
  }

  if (errors.length > 0) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'Invalid alert payload.', details: errors });
  }
  next();
}

function validateRouteIngest(req, res, next) {
  const { driver_phone_number, route_name, scheduled_date, tasks } = req.body || {};
  const errors = [];

  if (!driver_phone_number || typeof driver_phone_number !== 'string') {
    errors.push({ field: 'driver_phone_number', message: 'driver_phone_number is required to identify the assignee.' });
  }
  if (!route_name || typeof route_name !== 'string') {
    errors.push({ field: 'route_name', message: 'route_name is required.' });
  }
  if (!scheduled_date || isNaN(Date.parse(scheduled_date))) {
    errors.push({ field: 'scheduled_date', message: 'A valid scheduled_date is required.' });
  }
  if (!Array.isArray(tasks) || tasks.length === 0) {
    errors.push({ field: 'tasks', message: 'At least one task (pickup stop) is required.' });
  }

  if (errors.length > 0) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'Invalid route assignment payload.', details: errors });
  }
  next();
}

function validateSyncBatch(req, res, next) {
  const { driver_id, items } = req.body || {};
  const errors = [];

  if (!driver_id || typeof driver_id !== 'string') {
    errors.push({ field: 'driver_id', message: 'driver_id is required.' });
  }
  if (!Array.isArray(items)) {
    errors.push({ field: 'items', message: 'items must be an array of queued updates.' });
  }

  if (errors.length > 0) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'Invalid sync batch.', details: errors });
  }
  next();
}

function validateCreateDriver(req, res, next) {
  const { full_name, phone_number } = req.body || {};
  const errors = [];

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
    errors.push({ field: 'full_name', message: 'full_name is required (min 2 characters).' });
  }
  if (!phone_number || typeof phone_number !== 'string' || !/^\+?[0-9]{7,15}$/.test(phone_number.trim())) {
    errors.push({ field: 'phone_number', message: 'A valid phone number is required.' });
  }

  if (errors.length > 0) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'Invalid rider details.', details: errors });
  }
  next();
}

function validateDriverLogin(req, res, next) {
  const { phone_number } = req.body || {};
  if (!phone_number || typeof phone_number !== 'string' || !/^\+?[0-9]{7,15}$/.test(phone_number.trim())) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'A valid phone number is required.', details: [{ field: 'phone_number', message: 'A valid phone number is required.' }] });
  }
  next();
}

module.exports = {
  validateTaskStatusUpdate,
  validateLocationPing,
  validateAlert,
  validateRouteIngest,
  validateSyncBatch,
  validateCreateDriver,
  validateDriverLogin,
};
