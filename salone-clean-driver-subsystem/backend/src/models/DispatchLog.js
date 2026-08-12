// ============================================================================
// DispatchLog.js — Model layer (MVC). Encapsulates all SQL for
// `dispatch_log`, this subsystem's own local audit trail of what the
// Observer pipeline attempted to send outward (see LocalAuditObserver).
// ============================================================================

const { query } = require('../db');

class DispatchLog {
  static async record({ eventType, payload, dispatchStatus }) {
    const result = await query(
      `INSERT INTO dispatch_log (event_type, payload_snapshot, dispatch_status)
       VALUES ($1, $2, $3)
       RETURNING log_id, event_type, dispatch_status, created_at`,
      [eventType, JSON.stringify(payload), dispatchStatus]
    );
    return result.rows[0];
  }
}

module.exports = DispatchLog;
