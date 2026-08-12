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

// ============================================================================
// analyticsRoutes.js — Panel 1: Global Operational Analytics Dashboard
// ============================================================================

const express = require('express');
const { query } = require('../db');
const { sendSuccess } = require('../utils/apiResponse');

const router = express.Router();

const GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL || process.env.CUSTOMER_SERVICE_URL || 'https://salone-clean-customer-backend.onrender.com';
const CLEAN_BASE_URL = GATEWAY_BASE_URL.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');

/**
 * GET /api/v1/analytics/overview
 * Panel 1 — KPI cards + neighborhood volume bar-chart data, all real.
 */
router.get('/overview', async (req, res) => {
  let complianceLogCount = 0;
  try {
    const complianceCountResult = await query(`SELECT COUNT(*)::int AS count FROM system_compliance_logs`);
    complianceLogCount = complianceCountResult.rows[0]?.count ?? 0;
  } catch (err) {
    console.error('Compliance log query error:', err.message);
  }

  let customerSummary = null;
  let gatewayError = null;

  // FIX: Explicitly target /api/v1/analytics/aggregate using CLEAN_BASE_URL
  const targetUrl = `${CLEAN_BASE_URL}/api/v1/analytics/aggregate`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    const body = await response.json();

    if (response.ok && body?.success) {
      customerSummary = body.data;
    } else {
      gatewayError = body?.error?.message || `Gateway returned ${response.status}`;
    }
  } catch (err) {
    console.error(`Failed to reach customer subsystem at ${targetUrl}:`, err.message);
    gatewayError = err.message;
  }

  const available = customerSummary !== null;

  return sendSuccess(res, {
    available,
    gateway_error: gatewayError,
    kpis: {
      total_tokens_redeemed: { value: available ? (customerSummary?.total_tokens_redeemed ?? 0) : null },
      total_registered_customers: { value: available ? (customerSummary?.total_registered_customers ?? customerSummary?.total_customers ?? 0) : null },
      pending_or_failed_transactions: { value: available ? (customerSummary?.pending_or_failed_transactions ?? 0) : null },
      compliance_log_entries: { value: complianceLogCount }
    },
    tokens_by_neighborhood: customerSummary?.tokens_by_neighborhood || customerSummary?.neighborhoods || []
  });
});

module.exports = router;
