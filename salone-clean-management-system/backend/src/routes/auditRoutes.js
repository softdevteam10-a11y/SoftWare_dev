// ============================================================================
// auditRoutes.js — Panel 3: Audit Report Generator
//
// POST /api/v1/audit/reports
//  1. Validates the filter criteria (subsystem, date range, export format).
//  2. Queries system_compliance_logs for matching rows.
//  3. Writes ITS OWN audit entry documenting that a report was generated
//     (compliance systems audit themselves too — this is intentional).
//  4. Returns the filtered rows for the frontend to render/download.
//     "Mock PDF" is a deliberately simulated export (see README) — no PDF
//     binary library is used here, matching the spec's "download simulation".
// ============================================================================

const express = require('express');
const { query } = require('../db');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { validateAuditReportRequest } = require('../middleware/validators');

const router = express.Router();

router.post('/reports', validateAuditReportRequest, async (req, res) => {
  const { admin_user_id, target_subsystem, start_date, end_date, export_format } = req.body;

  try {
    const conditions = ['timestamp >= $1', 'timestamp <= $2'];
    const params = [new Date(start_date).toISOString(), new Date(end_date).toISOString()];

    if (target_subsystem !== 'ALL') {
      params.push(target_subsystem);
      conditions.push(`target_subsystem = $${params.length}`);
    }

    const rowsResult = await query(
      `SELECT log_id, admin_user_id, action_performed, target_subsystem, severity_level, timestamp
       FROM system_compliance_logs
       WHERE ${conditions.join(' AND ')}
       ORDER BY timestamp DESC`,
      params
    );

    const reportMeta = {
      target_subsystem,
      start_date,
      end_date,
      export_format,
      row_count: rowsResult.rowCount,
      generated_at: new Date().toISOString(),
    };

    // Self-audit: recording that a compliance report was generated, by whom,
    // and with what filters — this is itself a compliance-relevant event.
    await query(
      `INSERT INTO system_compliance_logs (admin_user_id, action_performed, target_subsystem, payload_snapshot, severity_level)
       VALUES ($1, 'GENERATE_AUDIT_REPORT', $2, $3, 'INFO')`,
      [admin_user_id, target_subsystem, JSON.stringify(reportMeta)]
    );

    return sendSuccess(res, {
      statusCode: 201,
      message: `Report generated: ${rowsResult.rowCount} matching log${rowsResult.rowCount === 1 ? '' : 's'}.`,
      data: { meta: reportMeta, rows: rowsResult.rows },
    });
  } catch (err) {
    console.error('[auditRoutes] report generation failed', err);
    return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not generate audit report.' });
  }
});

module.exports = router;
