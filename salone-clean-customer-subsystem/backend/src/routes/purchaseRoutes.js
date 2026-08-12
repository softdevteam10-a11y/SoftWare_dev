// ============================================================================
// purchaseRoutes.js — Panel 2 helper endpoint.
// Lets the frontend confirm its live-calculated total against the
// server's authoritative pricing table before submitting a real payment.
// ============================================================================

const express = require('express');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { SERVICE_TIERS, calculatePurchase } = require('../utils/pricing');

const router = express.Router();

/** GET /api/v1/purchases/tiers — service tier catalogue for the radio buttons. */
router.get('/tiers', (req, res) => {
  return sendSuccess(res, { data: SERVICE_TIERS });
});

/** GET /api/v1/purchases/quote?tier=medium&quantity=2 — live price preview. */
router.get('/quote', (req, res) => {
  const { tier, quantity } = req.query;
  const qty = Number(quantity);

  const pricing = calculatePurchase(tier, qty);
  if (!pricing) {
    return sendError(res, {
      statusCode: 422,
      code: 'INVALID_QUOTE_REQUEST',
      message: 'Provide a valid tier (small|medium|large) and quantity (> 0).',
    });
  }

  return sendSuccess(res, { data: { tier, quantity: qty, currency: 'SLE', ...pricing } });
});

module.exports = router;
