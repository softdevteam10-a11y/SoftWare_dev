// ============================================================================
// fleetRoutes.js — Panel 2 support: "Add Rider" and the route-builder's
// real customer/rider pickers.
//
// This subsystem has no riders or customers table of its own — everything
// here is a read/write THROUGH the API Gateway to the Driver Subsystem
// (riders) and Customer Subsystem (customers), never a direct database
// connection to either.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = express.Router();

const GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL || 'https://gateway.saloneclean.sl/api/v1';

/** GET /api/v1/fleet/riders — list riders (drivers) via the Gateway */
router.get('/riders', async (req, res) => {
  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/drivers`);
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `Gateway returned ${response.status}`);
    return sendSuccess(res, { data: body.data });
  } catch (err) {
    console.error('[fleetRoutes] list riders failed', err);
    return sendError(res, { statusCode: 502, code: 'GATEWAY_ERROR', message: `Could not load riders via the Gateway (${err.message}).` });
  }
});

/** POST /api/v1/fleet/riders — "Add Rider", forwarded via the Gateway to the Driver Subsystem */
router.post('/riders', async (req, res) => {
  const { full_name, phone_number, vehicle_label } = req.body || {};
  if (!full_name || !phone_number) {
    return sendError(res, { statusCode: 422, code: 'VALIDATION_ERROR', message: 'full_name and phone_number are required.' });
  }

  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/drivers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, phone_number, vehicle_label: vehicle_label || null }),
    });
    const body = await response.json();
    if (!response.ok) {
      return sendError(res, { statusCode: response.status, code: body?.error?.code || 'GATEWAY_ERROR', message: body?.error?.message || 'Could not add rider.', details: body?.error?.details });
    }
    return sendSuccess(res, { statusCode: 201, message: body.message || 'Rider added.', data: body.data });
  } catch (err) {
    console.error('[fleetRoutes] add rider failed', err);
    return sendError(res, { statusCode: 502, code: 'GATEWAY_ERROR', message: `Could not reach the Gateway to add this rider (${err.message}).` });
  }
});

/** GET /api/v1/fleet/customers — list customers via the Gateway, for the route-builder's stop picker */
router.get('/customers', async (req, res) => {
  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/customers/list`);
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `Gateway returned ${response.status}`);
    return sendSuccess(res, { data: body.data });
  } catch (err) {
    console.error('[fleetRoutes] list customers failed', err);
    return sendError(res, { statusCode: 502, code: 'GATEWAY_ERROR', message: `Could not load customers via the Gateway (${err.message}).` });
  }
});

module.exports = router;
