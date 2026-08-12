// ============================================================================
// complianceRoutes.js — Panel 2: Subsystem Configuration & Compliance Control
//
//  - GET  /api/v1/compliance/logs        list the audit table (with filters)
//  - GET  /api/v1/compliance/logs/:id    single log detail (for the JSON pop-up)
//  - POST /api/v1/compliance/deploy      "Deploy Global Route Update" —
//         writes a local audit row AND dispatches the config out through
//         the API Gateway. This subsystem never pushes config directly
//         into the Driver Subsystem's database.
// ============================================================================

const express = require('express');
const { query } = require('../db');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { validateRouteDeployment } = require('../middleware/validators');
const { postToGateway } = require('../utils/gatewayClient');

const router = express.Router();

/**
 * GET /api/v1/compliance/logs?subsystem=DRIVER&severity=WARNING&limit=50
 * Panel 2 — the administrative overview table.
 */
router.get('/logs', async (req, res) => {
  const { subsystem, severity, limit = 100 } = req.query;
  const conditions = [];
  const params = [];

  if (subsystem && subsystem !== 'ALL') {
    params.push(subsystem);
    conditions.push(`target_subsystem = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    conditions.push(`severity_level = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(Math.min(Number(limit) || 100, 500));

  try {
    const result = await query(
      `SELECT log_id, admin_user_id, action_performed, target_subsystem, severity_level, timestamp
       FROM system_compliance_logs
       ${whereClause}
       ORDER BY timestamp DESC
       LIMIT $${params.length}`,
      params
    );
    return sendSuccess(res, { data: result.rows });
  } catch (err) {
    console.error('[complianceRoutes] list logs failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load compliance logs.' });
  }
});

/**
 * GET /api/v1/compliance/logs/:logId
 * Panel 2 — row-click detail pop-up (full payload_snapshot).
 */
router.get('/logs/:logId', async (req, res) => {
  try {
    const result = await query(
      `SELECT log_id, admin_user_id, action_performed, target_subsystem, payload_snapshot, severity_level, timestamp
       FROM system_compliance_logs WHERE log_id = $1`,
      [req.params.logId]
    );
    if (result.rowCount === 0) {
      return sendError(res, { statusCode: 404, code: 'LOG_NOT_FOUND', message: 'No compliance log found with that ID.' });
    }
    return sendSuccess(res, { data: result.rows[0] });
  } catch (err) {
    console.error('[complianceRoutes] log detail failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load log detail.' });
  }
});

/**
 * POST /api/v1/compliance/deploy
 * Panel 2 — "Deploy Global Route Update"
 * 1. Writes an audit row locally FIRST (so the attempt is on record even if
 *    the Gateway call fails).
 * 2. Dispatches the config payload to the API Gateway.
 * 3. Updates the audit row's outcome based on the Gateway's response.
 */
router.post('/deploy', validateRouteDeployment, async (req, res) => {
  const { admin_user_id, target_subsystem, config_payload } = req.body;

  let logId;
  try {
    const insertResult = await query(
      `INSERT INTO system_compliance_logs (admin_user_id, action_performed, target_subsystem, payload_snapshot, severity_level)
       VALUES ($1, 'DEPLOY_GLOBAL_ROUTE_UPDATE', $2, $3, 'WARNING')
       RETURNING log_id`,
      [admin_user_id, target_subsystem, JSON.stringify({ status: 'dispatch_pending', config_payload })]
    );
    logId = insertResult.rows[0].log_id;
  } catch (err) {
    console.error('[complianceRoutes] pre-deploy audit write failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not record deployment attempt.' });
  }

  const gatewayResponse = await postToGateway('/routes/broadcast', {
    source_subsystem: 'management-subsystem',
    local_log_id: logId,
    admin_user_id,
    target_subsystem,
    config_payload,
  });

  const outcomeSnapshot = {
    status: gatewayResponse.ok ? 'dispatched' : 'dispatch_failed',
    config_payload,
    gateway_status: gatewayResponse.status,
    gateway_response: gatewayResponse.body,
  };

  try {
    await query(
      `UPDATE system_compliance_logs SET payload_snapshot = $2, severity_level = $3 WHERE log_id = $1`,
      [logId, JSON.stringify(outcomeSnapshot), gatewayResponse.ok ? 'INFO' : 'CRITICAL']
    );
  } catch (err) {
    console.error('[complianceRoutes] post-deploy audit update failed', err);
    // Not fatal to the response — the dispatch itself already happened.
  }

  if (!gatewayResponse.ok) {
    return sendError(res, {
      statusCode: 502,
      code: gatewayResponse.body?.code || 'GATEWAY_ERROR',
      message: 'The API Gateway rejected or could not reach the target subsystem with this route update.',
      details: { log_id: logId },
    });
  }

  return sendSuccess(res, {
    statusCode: 202,
    message: 'Global route update dispatched to the target subsystem via the API Gateway.',
    data: { log_id: logId, ...outcomeSnapshot },
  });
});

module.exports = router;
