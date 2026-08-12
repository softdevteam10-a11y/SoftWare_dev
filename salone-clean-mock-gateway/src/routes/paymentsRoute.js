// ============================================================================
// paymentsRoute.js — Simulates POST /payments/initialize on the real API
// Gateway. A real mobile money integration has to wait for the customer to
// approve a USSD/app prompt, which is why the Customer Subsystem's flow is
// built around an async "processing → webhook → completed" pattern. This
// mock has no real payment network to wait on, so it settles IMMEDIATELY:
// it decides the outcome, calls the Customer Subsystem's webhook right
// away, and only then responds to the original request — by the time the
// Customer Subsystem gets a response back, the transaction is already
// completed (or failed) in its own database.
//
// TESTING A FAILURE PATH: send a phone_number ending in "0000" and this
// mock will settle the payment as "failed" instead of "completed", so you
// can see that branch of the UI/backend too.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = express.Router();

const CUSTOMER_SUBSYSTEM_BASE_URL = process.env.CUSTOMER_SUBSYSTEM_BASE_URL || 'http://localhost:4001/api/v1';

function generateReference(provider) {
  const prefix = provider === 'orange_money' ? 'OM' : 'AM';
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${random}`;
}

router.post('/initialize', async (req, res) => {
  const { local_transaction_id, order, payment } = req.body || {};

  if (!local_transaction_id || !payment?.provider || !payment?.msisdn) {
    return sendError(res, {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'local_transaction_id, payment.provider, and payment.msisdn are required.',
    });
  }

  const reference = generateReference(payment.provider);
  const willFail = String(payment.msisdn).trim().endsWith('0000');
  const outcomeStatus = willFail ? 'failed' : 'completed';

  console.log(`[mock-gateway] ${payment.provider} ${order?.total_amount} SLE, ref ${reference} — settling instantly as "${outcomeStatus}" (no real settlement delay in this mock).`);

  // Settle right now by calling the Customer Subsystem's webhook BEFORE we
  // respond to this request, instead of scheduling it for later. This is
  // what makes the confirmation immediate from the frontend's point of view.
  try {
    const webhookResponse = await fetch(`${CUSTOMER_SUBSYSTEM_BASE_URL}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local_transaction_id,
        status: outcomeStatus,
        gateway_reference: reference,
      }),
    });
    if (!webhookResponse.ok) {
      console.error(`[mock-gateway] Customer Subsystem webhook returned ${webhookResponse.status}`);
    }
  } catch (err) {
    console.error('[mock-gateway] Could not reach the Customer Subsystem to settle this payment:', err.message);
    console.error('[mock-gateway] Is the Customer Subsystem running on', CUSTOMER_SUBSYSTEM_BASE_URL, '?');
    // Still respond below — the Customer Subsystem's own /initialize handler
    // falls back to "processing" if it sees its row is still pending, so
    // the transaction won't get stuck silently.
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: outcomeStatus === 'completed'
      ? 'Payment completed instantly (mock gateway — no real settlement delay).'
      : 'Payment declined instantly (mock gateway — no real settlement delay).',
    data: { reference, status: outcomeStatus },
  });
});

module.exports = router;
