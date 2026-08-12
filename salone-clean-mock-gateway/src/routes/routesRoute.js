// ============================================================================
// routesRoute.js — Simulates POST /routes/broadcast on the real API Gateway.
//
// This is the piece that makes Management's "Deploy Global Route Update"
// actually show up as a real assigned route in the Driver Subsystem: when
// target_subsystem is DRIVER (or ALL) and config_payload looks like a route
// assignment, this forwards it to the Driver Subsystem's
// POST /api/v1/routes/ingest — a real service-to-service hop through the
// Gateway, not a direct database write.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = express.Router();

const DRIVER_SUBSYSTEM_BASE_URL = process.env.DRIVER_SUBSYSTEM_BASE_URL || 'http://localhost:4004/api/v1';

router.post('/broadcast', async (req, res) => {
  const { source_subsystem, local_log_id, admin_user_id, target_subsystem, config_payload } = req.body || {};

  if (!target_subsystem || !config_payload) {
    return sendError(res, {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'target_subsystem and config_payload are required.',
    });
  }

  const dispatchId = `RT-${Date.now().toString(36).toUpperCase()}`;
  console.log(`[mock-gateway] Route update broadcast from ${source_subsystem} (log ${local_log_id}) -> ${target_subsystem}:`, config_payload);

  // Looks like a real route assignment (has the fields the Driver
  // Subsystem's /routes/ingest expects) AND is targeted at the driver
  // fleet — forward it for real instead of just logging it.
  const looksLikeRouteAssignment = config_payload.driver_phone_number && config_payload.route_name && Array.isArray(config_payload.tasks);
  const targetsDriverFleet = target_subsystem === 'DRIVER' || target_subsystem === 'ALL';

  if (looksLikeRouteAssignment && targetsDriverFleet) {
    try {
      const ingestResponse = await fetch(`${DRIVER_SUBSYSTEM_BASE_URL}/routes/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config_payload, source_dispatch_id: dispatchId }),
      });
      const ingestBody = await ingestResponse.json().catch(() => ({}));

      if (!ingestResponse.ok) {
        console.error('[mock-gateway] Driver Subsystem rejected the route ingest:', ingestBody?.error?.message);
        return sendError(res, {
          statusCode: 502,
          code: 'DRIVER_SUBSYSTEM_REJECTED',
          message: ingestBody?.error?.message || 'The Driver Subsystem rejected this route assignment.',
        });
      }

      return sendSuccess(res, {
        statusCode: 200,
        message: `Route "${config_payload.route_name}" assigned and now visible in the Driver Subsystem.`,
        data: { dispatch_id: dispatchId, target_subsystem, acknowledged_by: target_subsystem, admin_user_id, driver_subsystem_result: ingestBody?.data },
      });
    } catch (err) {
      console.error('[mock-gateway] Could not reach the Driver Subsystem to ingest this route:', err.message);
      return sendError(res, {
        statusCode: 502,
        code: 'DRIVER_SUBSYSTEM_UNREACHABLE',
        message: `Could not reach the Driver Subsystem at ${DRIVER_SUBSYSTEM_BASE_URL}. Is it running?`,
      });
    }
  }

  // Not a structured route assignment (e.g. a generic config tweak, or
  // targeted at CUSTOMER) — acknowledge without forwarding, same as before.
  return sendSuccess(res, {
    statusCode: 200,
    message: `Route update acknowledged by ${target_subsystem === 'ALL' ? 'all subsystems' : target_subsystem}.`,
    data: { dispatch_id: dispatchId, target_subsystem, acknowledged_by: target_subsystem, admin_user_id },
  });
});

module.exports = router;
