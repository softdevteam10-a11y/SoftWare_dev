// ============================================================================
// analyticsRoute.js — Simulates GET /analytics/aggregate on the real API
// Gateway: fans out to the subsystems that actually own the data and
// combines the results. This is the mechanism that lets the Management
// Subsystem's whole dashboard run on REAL data entered by customers —
// no placeholder numbers, no fake trucks or exceptions.
//
// There is no Driver Subsystem in this local setup, so anything that would
// require one (like fleet location) simply isn't offered here — the
// Management dashboard only asks for numbers this Gateway can actually
// answer for real.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = express.Router();

const CUSTOMER_SUBSYSTEM_BASE_URL = process.env.CUSTOMER_SUBSYSTEM_BASE_URL || 'http://localhost:4001/api/v1';

router.get('/aggregate', async (req, res) => {
  try {
    const response = await fetch(`${CUSTOMER_SUBSYSTEM_BASE_URL}/customers/aggregate/summary`);
    const body = await response.json();

    if (!response.ok || !body.success) {
      throw new Error(body?.error?.message || `Customer Subsystem returned ${response.status}`);
    }

    return sendSuccess(res, {
      data: {
        source: 'customer-subsystem',
        ...body.data,
      },
    });
  } catch (err) {
    console.error('[mock-gateway] Could not reach Customer Subsystem for analytics summary:', err.message);
    return sendError(res, {
      statusCode: 502,
      code: 'CUSTOMER_SUBSYSTEM_UNREACHABLE',
      message: 'Could not reach the Customer Subsystem to build the analytics summary. Is it running on ' + CUSTOMER_SUBSYSTEM_BASE_URL + '?',
    });
  }
});

module.exports = router;
