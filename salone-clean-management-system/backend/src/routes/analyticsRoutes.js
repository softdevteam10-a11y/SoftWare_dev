// ============================================================================
// analyticsRoutes.js — Panel 1: Global Operational Analytics Dashboard
//
// Every number here is REAL, sourced from data customers actually entered
// in the Customer Subsystem, fetched through the API Gateway's analytics
// fan-out — this subsystem never touches the Customer Subsystem's database
// directly. There is no Driver Subsystem in this local setup, so this
// dashboard does not show fleet metrics (trucks, live locations) — it only
// reports what it can actually answer for real. If the Gateway or Customer
// Subsystem is unreachable, the response says so honestly instead of
// filling the gap with a fake number.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { query } = require('../db');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = express.Router();

const GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL || 'https://salone-clean-customer-backend.onrender.com'; // Default to the deployed Customer Subsystem if not set
const CLEAN_BASE_URL = GATEWAY_BASE_URL.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');

/**
 * GET /api/v1/analytics/overview
 * Panel 1 — KPI cards + neighborhood volume bar-chart data, all real.
 */
router.get('/overview', async (req, res) => {
  // The one figure this subsystem can speak to authoritatively on its own:
  // how much administrative/compliance activity has occurred locally.
  const complianceCountResult = await query(`SELECT COUNT(*)::int AS count FROM system_compliance_logs`);
  const complianceLogCount = complianceCountResult.rows[0]?.count ?? 0;

  let customerSummary = null;
  let gatewayError = null;

  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/analytics/aggregate`, { timeout: 5000 });
    const body = await response.json();
    if (response.ok && body?.success) {
      customerSummary = body.data;
    } else {
      gatewayError = body?.error?.message || `Gateway returned ${response.status}`;
    }
  } catch (err) {
    gatewayError = err.message;
  }

  
  const available = customerSummary !== null;

  return sendSuccess(res, {
    available, // false means the cards below should show an "unavailable" state
    gateway_error: gatewayError,
    kpis: {
      total_tokens_redeemed: { value: available ? customerSummary.total_tokens_redeemed : null },
      total_registered_customers: { value: available ? customerSummary.total_customers : null },
      pending_or_failed_transactions: { value: available ? customerSummary.pending_or_failed_transactions : null },
      compliance_log_entries: { value: complianceLogCount }
    },
    tokens_by_neighborhood: customerSummary?.tokens_by_neighborhood || customerSummary?.neighborhoods || []
  });
});

module.exports = router;
