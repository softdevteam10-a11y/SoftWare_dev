// ============================================================================
// customersProxyRoute.js — Simulates GET /customers/list on the real API
// Gateway: a read-only pass-through to the Customer Subsystem, used by the
// Management Subsystem to pick real customers when building a route
// assignment. Management never queries the Customer Subsystem's database.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { CROSS_SERVICE_TIMEOUT_MS } = require('../utils/timeouts');

const router = express.Router();

const CUSTOMER_SUBSYSTEM_BASE_URL = process.env.CUSTOMER_SUBSYSTEM_BASE_URL || 'http://localhost:4001/api/v1';

router.get('/list', async (req, res) => {
  try {
    const response = await fetch(`${CUSTOMER_SUBSYSTEM_BASE_URL}/customers/list`, { timeout: CROSS_SERVICE_TIMEOUT_MS });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `Customer Subsystem returned ${response.status}`);
    return sendSuccess(res, { data: body.data });
  } catch (err) {
    console.error('[mock-gateway] Could not reach Customer Subsystem for customer list:', err.message);
    return sendError(res, { statusCode: 502, code: 'CUSTOMER_SUBSYSTEM_UNREACHABLE', message: `Could not reach the Customer Subsystem at ${CUSTOMER_SUBSYSTEM_BASE_URL}. Is it running?` });
  }
});

module.exports = router;
