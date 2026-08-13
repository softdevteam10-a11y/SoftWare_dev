// ============================================================================
// driversProxyRoute.js — Simulates GET/POST /drivers on the real API
// Gateway: a pass-through to the Driver Subsystem, used by the Management
// Subsystem's "Add Rider" feature and route-assignment picker. Management
// never writes into the Driver Subsystem's database directly.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { CROSS_SERVICE_TIMEOUT_MS } = require('../utils/timeouts');

const router = express.Router();

const DRIVER_SUBSYSTEM_BASE_URL = process.env.DRIVER_SUBSYSTEM_BASE_URL || 'http://localhost:4004/api/v1';

router.get('/', async (req, res) => {
  try {
    const response = await fetch(`${DRIVER_SUBSYSTEM_BASE_URL}/drivers`, { timeout: CROSS_SERVICE_TIMEOUT_MS });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `Driver Subsystem returned ${response.status}`);
    return sendSuccess(res, { data: body.data });
  } catch (err) {
    console.error('[mock-gateway] Could not reach Driver Subsystem for rider list:', err.message);
    return sendError(res, { statusCode: 502, code: 'DRIVER_SUBSYSTEM_UNREACHABLE', message: `Could not reach the Driver Subsystem at ${DRIVER_SUBSYSTEM_BASE_URL}. Is it running?` });
  }
});

router.post('/', async (req, res) => {
  try {
    const response = await fetch(`${DRIVER_SUBSYSTEM_BASE_URL}/drivers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      timeout: CROSS_SERVICE_TIMEOUT_MS,
    });
    const body = await response.json();
    if (!response.ok) {
      return sendError(res, { statusCode: response.status, code: body?.error?.code || 'DRIVER_SUBSYSTEM_ERROR', message: body?.error?.message || 'Could not add rider.', details: body?.error?.details });
    }
    return sendSuccess(res, { statusCode: 201, message: body.message, data: body.data });
  } catch (err) {
    console.error('[mock-gateway] Could not reach Driver Subsystem to add rider:', err.message);
    return sendError(res, { statusCode: 502, code: 'DRIVER_SUBSYSTEM_UNREACHABLE', message: `Could not reach the Driver Subsystem at ${DRIVER_SUBSYSTEM_BASE_URL}. Is it running?` });
  }
});

module.exports = router;
