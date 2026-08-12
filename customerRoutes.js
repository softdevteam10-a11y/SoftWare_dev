// ============================================================================
// customerRoutes.js
//   Panel 1 — Account Setup / Registration
//   Panel 3 — History & Balance Dashboard
// All reads/writes here hit ONLY this subsystem's local `customer_subscriptions`
// and `customer_transactions` tables. No other subsystem's data is touched.
// ============================================================================

const express = require('express');
const { query } = require('../db');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { validateCustomerRegistration, NEIGHBORHOODS } = require('../middleware/validators');

const router = express.Router();

/**
 * GET /api/v1/customers/neighborhoods
 * Backs the dropdown in Panel 1. Kept server-side so the list is
 * consistent between web/mobile clients and easy to update in one place.
 */
router.get('/neighborhoods', (req, res) => {
  return sendSuccess(res, { data: NEIGHBORHOODS });
});

/**
 * POST /api/v1/customers
 * Panel 1 — "Save & Register Profile"
 * Creates a new local customer profile. `signature_data` is expected to be
 * a data-URL (base64 PNG) captured from the signature pad, or the string
 * "verified-tap" if the user used the tap-to-verify fallback.
 */
router.post('/', validateCustomerRegistration, async (req, res) => {
  const {
    full_name,
    phone_number,
    email_address = null,
    neighborhood_tag,
    street_address,
    signature_data = null,
  } = req.body;

  try {
    const result = await query(
      `INSERT INTO customer_subscriptions
         (full_name, phone_number, email_address, neighborhood_tag, street_address, signature_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING subscription_id, full_name, phone_number, email_address,
                 neighborhood_tag, street_address, token_balance, created_at`,
      [full_name.trim(), phone_number.trim(), email_address, neighborhood_tag, street_address.trim(), signature_data]
    );

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Profile registered successfully.',
      data: result.rows[0],
    });
  } catch (err) {
    // Unique violation on phone_number
    if (err.code === '23505') {
      return sendError(res, {
        statusCode: 409,
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'This phone number is already registered with Salone Clean.',
      });
    }
    console.error('[customerRoutes] registration failed', err);
    return sendError(res, {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Could not register profile. Please try again shortly.',
    });
  }
});

/**
 * GET /api/v1/customers/aggregate/tokens-redeemed
 * Cross-subsystem read: this is the endpoint the API Gateway's analytics
 * aggregation calls to get a REAL "total tokens redeemed" figure for the
 * Management Subsystem's dashboard, instead of that KPI being simulated.
 * Placed above the :subscriptionId route below so "aggregate" isn't
 * swallowed as if it were a subscription ID.
 */
router.get('/aggregate/tokens-redeemed', async (req, res) => {
  try {
    const result = await query(
      `SELECT COALESCE(SUM(tokens_purchased), 0)::int AS total
       FROM customer_transactions WHERE status = 'completed'`
    );
    return sendSuccess(res, { data: { total_tokens_redeemed: result.rows[0].total } });
  } catch (err) {
    console.error('[customerRoutes] tokens-redeemed aggregate failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not compute tokens-redeemed aggregate.' });
  }
});

/**
 * GET /api/v1/customers/:subscriptionId
 * Panel 3 — fetch the profile + current token balance for the dashboard header.
 */
router.get('/:subscriptionId', async (req, res) => {
  const { subscriptionId } = req.params;
  try {
    const result = await query(
      `SELECT subscription_id, full_name, phone_number, email_address,
              neighborhood_tag, street_address, token_balance, created_at
       FROM customer_subscriptions
       WHERE subscription_id = $1`,
      [subscriptionId]
    );

    if (result.rowCount === 0) {
      return sendError(res, { statusCode: 404, code: 'CUSTOMER_NOT_FOUND', message: 'No customer found with that ID.' });
    }

    return sendSuccess(res, { data: result.rows[0] });
  } catch (err) {
    console.error('[customerRoutes] fetch profile failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load profile.' });
  }
});

/**
 * GET /api/v1/customers/:subscriptionId/history
 * Panel 3 — the transaction/subscription-status table.
 */
router.get('/:subscriptionId/history', async (req, res) => {
  const { subscriptionId } = req.params;
  try {
    const result = await query(
      `SELECT transaction_id, service_tier, quantity, tokens_purchased,
              unit_price_sle, total_price_sle, payment_provider,
              gateway_reference, status, created_at
       FROM customer_transactions
       WHERE subscription_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [subscriptionId]
    );

    return sendSuccess(res, { data: result.rows });
  } catch (err) {
    console.error('[customerRoutes] fetch history failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load transaction history.' });
  }
});

module.exports = router;
