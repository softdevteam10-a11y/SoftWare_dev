// ============================================================================
// paymentRoutes.js — Panel 2: Tokenized Purchase Hub
//
// Flow:
//  1. Validate the purchase payload.
//  2. Recompute price/tokens server-side (never trust client-sent totals).
//  3. Write a local `pending` row to customer_transactions (our own ledger).
//  4. Forward the transaction to the API Gateway's
//     /api/v1/payments/initialize endpoint — this is the ONLY point where
//     this subsystem talks to the outside platform (mobile money rail,
//     Management Subsystem notifications, etc).
//  5. Update the local row + token_balance based on what the Gateway says.
// ============================================================================

const express = require('express');
const { query, pool } = require('../db');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { validatePurchasePayload } = require('../middleware/validators');
const { calculatePurchase } = require('../utils/pricing');
const { initializeGatewayPayment } = require('../utils/gatewayClient');

const router = express.Router();

/**
 * POST /api/v1/payments/initialize
 * Panel 2 — "Process Mobile Money Payment"
 */
router.post('/initialize', validatePurchasePayload, async (req, res) => {
  const { subscription_id, service_tier, quantity, payment_provider, phone_number } = req.body;

  const pricing = calculatePurchase(service_tier, quantity);
  if (!pricing) {
    return sendError(res, {
      statusCode: 422,
      code: 'INVALID_PURCHASE',
      message: 'Could not calculate a price for the selected tier/quantity.',
    });
  }

  const client = await pool.connect();
  try {
    // Make sure the customer actually exists locally before we spend a
    // round trip to the Gateway.
    const customerCheck = await client.query(
      `SELECT subscription_id FROM customer_subscriptions WHERE subscription_id = $1`,
      [subscription_id]
    );
    if (customerCheck.rowCount === 0) {
      return sendError(res, { statusCode: 404, code: 'CUSTOMER_NOT_FOUND', message: 'No matching customer profile found.' });
    }

    // Step 1: record the attempt locally as "pending" before calling out.
    const insertResult = await client.query(
      `INSERT INTO customer_transactions
         (subscription_id, service_tier, quantity, tokens_purchased, unit_price_sle, total_price_sle, payment_provider, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING transaction_id`,
      [subscription_id, service_tier, quantity, pricing.tokens, pricing.unitPrice, pricing.totalPrice, payment_provider]
    );
    const transactionId = insertResult.rows[0].transaction_id;

    // Step 2: forward to API Gateway. The Gateway owns actually talking to
    // Orange Money / Africell Money, and downstream, notifying the Driver
    // and Management subsystems once a payment clears.
    const gatewayPayload = {
      source_subsystem: 'customer-subsystem',
      local_transaction_id: transactionId,
      customer: { subscription_id, phone_number },
      order: {
        service_tier,
        quantity,
        tokens: pricing.tokens,
        currency: 'SLE',
        total_amount: pricing.totalPrice,
      },
      payment: { provider: payment_provider, msisdn: phone_number },
    };

    const gatewayResponse = await initializeGatewayPayment(gatewayPayload);

    // Step 3: reconcile local state with what the Gateway told us.
    if (gatewayResponse.ok) {
      const gatewayReference = gatewayResponse.body?.data?.reference || gatewayResponse.body?.reference || null;

      // IMPORTANT: don't blindly set status = 'processing' here. A gateway
      // (including the local mock one) may settle synchronously by calling
      // our own /payments/webhook BEFORE responding to this request — in
      // that case our row is already 'completed' or 'failed', and
      // overwriting it back to 'processing' would be a regression. Only
      // move a still-pending row to 'processing'; leave an already-settled
      // one alone.
      const conditionalUpdate = await client.query(
        `UPDATE customer_transactions
         SET status = 'processing', gateway_reference = $2
         WHERE transaction_id = $1 AND status = 'pending'
         RETURNING status`,
        [transactionId, gatewayReference]
      );

      let finalStatus;
      if (conditionalUpdate.rowCount > 0) {
        // Row was still pending — this is a genuinely async gateway; the
        // customer needs to approve a prompt, and a later webhook call
        // will move it to completed/failed.
        finalStatus = 'processing';
      } else {
        // Row was already settled by a synchronous webhook (e.g. this local
        // mock gateway) — read back what actually happened.
        const settledResult = await client.query(
          `SELECT status FROM customer_transactions WHERE transaction_id = $1`,
          [transactionId]
        );
        finalStatus = settledResult.rows[0]?.status || 'processing';
      }

      const message = finalStatus === 'completed'
        ? `Payment completed — ${pricing.tokens} token${pricing.tokens === 1 ? '' : 's'} credited to your balance.`
        : finalStatus === 'failed'
          ? 'The mobile money provider declined this payment. No tokens were charged.'
          : 'Payment request sent to your mobile money provider. Approve the prompt on your phone to complete it.';

      return sendSuccess(res, {
        statusCode: finalStatus === 'processing' ? 202 : 200,
        message,
        data: {
          transaction_id: transactionId,
          gateway_reference: gatewayReference,
          status: finalStatus,
          ...pricing,
        },
      });
    }

    // Gateway rejected or was unreachable — mark the local record failed
    // but keep it for audit/history purposes rather than deleting it.
    await client.query(
      `UPDATE customer_transactions SET status = 'failed' WHERE transaction_id = $1`,
      [transactionId]
    );

    return sendError(res, {
      statusCode: 502,
      code: gatewayResponse.body?.code || 'GATEWAY_ERROR',
      message: gatewayResponse.body?.message || 'The payment gateway could not process this request. Please try again.',
    });
  } catch (err) {
    console.error('[paymentRoutes] initialize failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not process payment request.' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/payments/webhook
 * Optional: the API Gateway calls this back once a mobile money payment
 * actually clears, so we can credit tokens locally. In production this
 * route should verify a signature/service key from the Gateway.
 */
router.post('/webhook', async (req, res) => {
  const { local_transaction_id, status, gateway_reference } = req.body || {};

  if (!local_transaction_id || !['completed', 'failed'].includes(status)) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'local_transaction_id and a valid status are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const txResult = await client.query(
      `SELECT subscription_id, tokens_purchased, status AS current_status
       FROM customer_transactions WHERE transaction_id = $1 FOR UPDATE`,
      [local_transaction_id]
    );

    if (txResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return sendError(res, { statusCode: 404, code: 'TRANSACTION_NOT_FOUND', message: 'Unknown transaction_id.' });
    }

    const tx = txResult.rows[0];

    // Idempotency guard: don't double-credit tokens on a repeated webhook call.
    if (tx.current_status === 'completed' || tx.current_status === 'failed') {
      await client.query('ROLLBACK');
      return sendSuccess(res, { message: 'Transaction already finalized; no changes made.' });
    }

    await client.query(
      `UPDATE customer_transactions SET status = $2, gateway_reference = COALESCE($3, gateway_reference) WHERE transaction_id = $1`,
      [local_transaction_id, status, gateway_reference]
    );

    if (status === 'completed') {
      await client.query(
        `UPDATE customer_subscriptions SET token_balance = token_balance + $2 WHERE subscription_id = $1`,
        [tx.subscription_id, tx.tokens_purchased]
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, { message: `Transaction marked ${status}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[paymentRoutes] webhook failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not process webhook.' });
  } finally {
    client.release();
  }
});

module.exports = router;
