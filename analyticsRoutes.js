// ============================================================================
// analyticsRoutes.js — Panel 1: Global Operational Analytics Dashboard
//
// Decoupling note: this subsystem does NOT own trucks, drivers, or token
// data — those live in the Driver and Customer subsystems. In production,
// these KPIs would be pulled by the API Gateway from an aggregation
// endpoint that fans out to both subsystems and caches the result. Since
// this service must stand alone here, the numbers below are clearly marked
// SIMULATED, with the one real number (compliance log volume) computed
// from this subsystem's own audit table.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { query } = require('../db');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = express.Router();

const GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL || 'https://gateway.saloneclean.sl/api/v1';

/**
 * Ask the API Gateway's aggregate endpoint for a REAL tokens-redeemed
 * figure (the Gateway fans this out to the Customer Subsystem, the system
 * of record for tokens). Falls back to `null` if the Gateway or the
 * Customer Subsystem is unreachable — the caller decides what to show then.
 */
async function fetchRealTokensRedeemed() {
  try {
    const response = await fetch(`${GATEWAY_BASE_URL}/analytics/aggregate`, { timeout: 5000 });
    const body = await response.json();
    if (response.ok && body?.success && body.data?.total_tokens_redeemed?.source === 'customer-subsystem') {
      return body.data.total_tokens_redeemed.value;
    }
  } catch (err) {
    console.error('[analyticsRoutes] Gateway aggregate call failed, falling back to simulated value:', err.message);
  }
  return null;
}

const FREETOWN_NEIGHBORHOODS = [
  'Aberdeen', 'Lumley', 'Congo Cross', 'Wilberforce', 'Hill Station', 'Kissy', 'Wellington',
];

/**
 * Deterministic-but-varying pseudo-random generator so demo numbers don't
 * jump around wildly on every refresh within the same day (nice for demos).
 */
function seededVolume(seedText, min, max) {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  const dayKey = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
  return min + (hash % (max - min + 1));
}

/**
 * GET /api/v1/analytics/overview
 * Panel 1 — KPI cards + weekly volume bar-chart data.
 */
router.get('/overview', async (req, res) => {
  try {
    // The one figure this subsystem can speak to authoritatively: how much
    // administrative/compliance activity has occurred locally.
    const complianceCountResult = await query(`SELECT COUNT(*)::int AS count FROM system_compliance_logs`);
    const complianceLogCount = complianceCountResult.rows[0]?.count ?? 0;

    // Try to get a REAL figure from the Gateway (which asks the Customer
    // Subsystem, the system of record for tokens). Only fall back to a
    // simulated number if that call fails — same behavior a real Gateway
    // integration would have during an outage.
    const realTokensRedeemed = await fetchRealTokensRedeemed();

    // Active trucks / pending exceptions stay SIMULATED — there's no Driver
    // Subsystem in this local setup to ask, so in production these would
    // come from the Gateway's aggregate endpoint fanning out to it.
    const kpis = {
      total_tokens_redeemed: realTokensRedeemed !== null
        ? { value: realTokensRedeemed, simulated: false }
        : { value: seededVolume('tokens', 8200, 9600), simulated: true },
      active_trucks_en_route: { value: seededVolume('trucks', 9, 22), simulated: true },
      pending_service_exceptions: { value: seededVolume('exceptions', 2, 14), simulated: true },
      compliance_log_entries: { value: complianceLogCount, simulated: false },
    };

    // SIMULATED — weekly collection volume per neighborhood for the bar chart.
    const weeklyVolumes = FREETOWN_NEIGHBORHOODS.map((neighborhood) => ({
      neighborhood,
      bins_collected: seededVolume(neighborhood, 40, 260),
    }));

    return sendSuccess(res, { data: { kpis, weekly_volumes: weeklyVolumes, currency: 'SLE' } });
  } catch (err) {
    console.error('[analyticsRoutes] overview failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load analytics overview.' });
  }
});

module.exports = router;
