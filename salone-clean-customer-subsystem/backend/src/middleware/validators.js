// ============================================================================
// validators.js — Lightweight, dependency-free request validation.
// Each validator is Express middleware: it either calls next(), or responds
// with a standardized 422 error and stops the chain.
// ============================================================================

const { sendError } = require('../utils/apiResponse');

const PHONE_REGEX = /^\+?[0-9]{7,15}$/; // permissive international-ish phone check
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_REGEX = /^[0-9]{4}$/;

const NEIGHBORHOODS = [
  'Aberdeen', 'Lumley', 'Congo Cross', 'Wilberforce', 'Hill Station',
  'Brookfields', 'New England', 'Murray Town', 'Kissy', 'Wellington',
  'Calaba Town', 'Goderich', 'Regent', 'Tengbeh Town', 'East End',
];

/** Panel 1: validate a new customer registration payload. */
function validateCustomerRegistration(req, res, next) {
  const { full_name, phone_number, email_address, neighborhood_tag, street_address, pin } = req.body || {};
  const errors = [];

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
    errors.push({ field: 'full_name', message: 'Full name is required (min 2 characters).' });
  }
  if (!phone_number || typeof phone_number !== 'string' || !PHONE_REGEX.test(phone_number.trim())) {
    errors.push({ field: 'phone_number', message: 'A valid primary phone number is required.' });
  }
  if (email_address && !EMAIL_REGEX.test(String(email_address).trim())) {
    errors.push({ field: 'email_address', message: 'Email address is not valid.' });
  }
  if (!neighborhood_tag || typeof neighborhood_tag !== 'string') {
    errors.push({ field: 'neighborhood_tag', message: 'Please select a neighborhood.' });
  }
  if (!street_address || typeof street_address !== 'string' || street_address.trim().length < 5) {
    errors.push({ field: 'street_address', message: 'Street address / landmarks are required (min 5 characters).' });
  }
  if (!pin || !PIN_REGEX.test(String(pin))) {
    errors.push({ field: 'pin', message: 'A 4-digit PIN is required so you can log back in later.' });
  }

  if (errors.length > 0) {
    return sendError(res, {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Some registration fields need attention.',
      details: errors,
    });
  }

  next();
}

/** Login: validate a phone number + PIN login attempt. */
function validateLogin(req, res, next) {
  const { phone_number, pin } = req.body || {};
  const errors = [];

  if (!phone_number || typeof phone_number !== 'string' || !PHONE_REGEX.test(phone_number.trim())) {
    errors.push({ field: 'phone_number', message: 'A valid phone number is required.' });
  }
  if (!pin || !PIN_REGEX.test(String(pin))) {
    errors.push({ field: 'pin', message: 'A 4-digit PIN is required.' });
  }

  if (errors.length > 0) {
    return sendError(res, {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Enter your phone number and PIN.',
      details: errors,
    });
  }

  next();
}

/** Panel 2: validate a token-purchase / payment-initialization payload. */
function validatePurchasePayload(req, res, next) {
  const { subscription_id, service_tier, quantity, payment_provider, phone_number } = req.body || {};
  const errors = [];

  if (!subscription_id || typeof subscription_id !== 'string') {
    errors.push({ field: 'subscription_id', message: 'A customer subscription_id is required.' });
  }
  if (!['small', 'medium', 'large'].includes(service_tier)) {
    errors.push({ field: 'service_tier', message: 'service_tier must be one of: small, medium, large.' });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    errors.push({ field: 'quantity', message: 'Quantity must be a whole number greater than 0.' });
  }
  if (!['orange_money', 'africell_money'].includes(payment_provider)) {
    errors.push({ field: 'payment_provider', message: 'payment_provider must be orange_money or africell_money.' });
  }
  if (!phone_number || !PHONE_REGEX.test(String(phone_number).trim())) {
    errors.push({ field: 'phone_number', message: 'A valid mobile money phone number is required.' });
  }

  if (errors.length > 0) {
    return sendError(res, {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Some payment fields need attention.',
      details: errors,
    });
  }

  next();
}

module.exports = {
  validateCustomerRegistration,
  validateLogin,
  validatePurchasePayload,
  NEIGHBORHOODS,
  PHONE_REGEX,
};
