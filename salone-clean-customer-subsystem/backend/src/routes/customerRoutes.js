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
const { validateCustomerRegistration, validateLogin, NEIGHBORHOODS } = require('../middleware/validators');
const { hashPin, verifyPin } = require('../utils/pin');

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
    pin,
  } = req.body;

  try {
    const result = await query(
      `INSERT INTO customer_subscriptions
         (full_name, phone_number, email_address, neighborhood_tag, street_address, signature_data, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING subscription_id, full_name, phone_number, email_address,
                 neighborhood_tag, street_address, token_balance, created_at`,
      [full_name.trim(), phone_number.trim(), email_address, neighborhood_tag, street_address.trim(), signature_data, hashPin(pin)]
    );

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Profile registered successfully.',
      data: result.rows[0], // pin_hash intentionally excluded from RETURNING — never sent to the client
    });
  } catch (err) {
    // Unique violation on phone_number
    if (err.code === '23505') {
      return sendError(res, {
        statusCode: 409,
        code: 'PHONE_ALREADY_REGISTERED',
        message: 'This phone number is already registered with Salone Clean. Try logging in instead.',
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
 * POST /api/v1/customers/login
 * Returning customers log in with their phone number + 4-digit PIN instead
 * of registering again. This is a lightweight local-demo auth (no session
 * token issued) — see the frontend's session-state note for how a real
 * deployment should replace this.
 */
router.post('/login', validateLogin, async (req, res) => {
  const { phone_number, pin } = req.body;

  try {
    const result = await query(
      `SELECT subscription_id, full_name, phone_number, email_address,
              neighborhood_tag, street_address, token_balance, pin_hash, created_at
       FROM customer_subscriptions WHERE phone_number = $1`,
      [phone_number.trim()]
    );

    if (result.rowCount === 0 || !verifyPin(pin, result.rows[0].pin_hash)) {
      // Same message whether the phone number doesn't exist or the PIN is
      // wrong — don't reveal which one to an attacker probing phone numbers.
      return sendError(res, { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Phone number or PIN is incorrect.' });
    }

    const { pin_hash, ...customer } = result.rows[0]; // never send pin_hash to the client
    return sendSuccess(res, { message: `Welcome back, ${customer.full_name.split(' ')[0]}.`, data: customer });
  } catch (err) {
    console.error('[customerRoutes] login failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not log in. Please try again shortly.' });
  }
});

/**
 * GET /api/v1/customers/aggregate/summary
 * Cross-subsystem read: this is what the API Gateway's analytics
 * aggregation calls to build the Management Subsystem's dashboard entirely
 * from REAL data this subsystem owns — no simulated numbers. Placed above
 * the :subscriptionId route below so "aggregate" isn't swallowed as if it
 * were a subscription ID.
 */
router.get('/aggregate/summary', async (req, res) => {
  try {
    const [customersResult, tokensResult, exceptionsResult, neighborhoodResult] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM customer_subscriptions`),
      query(`SELECT COALESCE(SUM(tokens_purchased), 0)::int AS total FROM customer_transactions WHERE status = 'completed'`),
      query(`SELECT COUNT(*)::int AS total FROM customer_transactions WHERE status IN ('pending', 'processing', 'failed')`),
      query(
        `SELECT cs.neighborhood_tag AS neighborhood,
                COALESCE(SUM(ct.tokens_purchased) FILTER (WHERE ct.status = 'completed'), 0)::int AS tokens
         FROM customer_subscriptions cs
         LEFT JOIN customer_transactions ct ON ct.subscription_id = cs.subscription_id
         GROUP BY cs.neighborhood_tag
         ORDER BY tokens DESC`
      ),
    ]);

    return sendSuccess(res, {
      data: {
        total_customers: customersResult.rows[0].total,
        total_tokens_redeemed: tokensResult.rows[0].total,
        pending_or_failed_transactions: exceptionsResult.rows[0].total,
        tokens_by_neighborhood: neighborhoodResult.rows,
      },
    });
  } catch (err) {
    console.error('[customerRoutes] aggregate summary failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not compute aggregate summary.' });
  }
});

/**
 * GET /api/v1/customers/list
 * Cross-subsystem read: this is what the API Gateway calls when the
 * Management Subsystem needs to show a picker of real customers to build a
 * route assignment (see Management's "Deploy Global Route Update"). Returns
 * only what's needed to build a pickup stop — no payment/PIN data. Placed
 * above :subscriptionId so "list" isn't swallowed as if it were an ID.
 */
router.get('/list', async (req, res) => {
  try {
    const result = await query(
      `SELECT subscription_id, full_name, neighborhood_tag, street_address, phone_number
       FROM customer_subscriptions
       ORDER BY full_name ASC`
    );
    return sendSuccess(res, { data: result.rows });
  } catch (err) {
    console.error('[customerRoutes] list failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load customer list.' });
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

/**
 * POST /api/v1/customers/:subscriptionId/notifications
 * Inbound: the API Gateway calls this when the Driver Subsystem reports a
 * completed pickup (or other event) for one of our customers — this is how
 * "customer gets notified after the rider checks the trash" is wired up,
 * without this subsystem ever reading the Driver Subsystem's database.
 */
router.post('/:subscriptionId/notifications', async (req, res) => {
  const { subscriptionId } = req.params;
  const { title, message, source_subsystem = 'driver-subsystem' } = req.body || {};

  if (!title || !message) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'title and message are required.' });
  }

  try {
    const customerCheck = await query(`SELECT subscription_id FROM customer_subscriptions WHERE subscription_id = $1`, [subscriptionId]);
    if (customerCheck.rowCount === 0) {
      return sendError(res, { statusCode: 404, code: 'CUSTOMER_NOT_FOUND', message: 'No customer found with that ID.' });
    }

    const result = await query(
      `INSERT INTO customer_notifications (subscription_id, title, message, source_subsystem)
       VALUES ($1, $2, $3, $4)
       RETURNING notification_id, title, message, source_subsystem, is_read, created_at`,
      [subscriptionId, title, message, source_subsystem]
    );

    return sendSuccess(res, { statusCode: 201, message: 'Notification created.', data: result.rows[0] });
  } catch (err) {
    console.error('[customerRoutes] create notification failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not create notification.' });
  }
});

/**
 * GET /api/v1/customers/:subscriptionId/notifications
 * The customer's own notification feed (e.g. "your bin was collected").
 */
router.get('/:subscriptionId/notifications', async (req, res) => {
  const { subscriptionId } = req.params;
  try {
    const result = await query(
      `SELECT notification_id, title, message, source_subsystem, is_read, created_at
       FROM customer_notifications
       WHERE subscription_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [subscriptionId]
    );
    return sendSuccess(res, { data: result.rows });
  } catch (err) {
    console.error('[customerRoutes] list notifications failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load notifications.' });
  }
});

/**
 * PATCH /api/v1/customers/:subscriptionId/notifications/:notificationId/read
 * Mark a single notification as read.
 */
router.patch('/:subscriptionId/notifications/:notificationId/read', async (req, res) => {
  const { subscriptionId, notificationId } = req.params;
  try {
    const result = await query(
      `UPDATE customer_notifications SET is_read = true
       WHERE notification_id = $1 AND subscription_id = $2
       RETURNING notification_id, is_read`,
      [notificationId, subscriptionId]
    );
    if (result.rowCount === 0) {
      return sendError(res, { statusCode: 404, code: 'NOTIFICATION_NOT_FOUND', message: 'No matching notification found.' });
    }
    return sendSuccess(res, { data: result.rows[0] });
  } catch (err) {
    console.error('[customerRoutes] mark notification read failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not update notification.' });
  }
});

module.exports = router;
