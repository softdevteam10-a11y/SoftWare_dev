// ============================================================================
// Alert.js — Model layer (MVC). Encapsulates all SQL for `driver_alerts`
// (e.g. "bin full", "obstruction") raised from the field.
// ============================================================================

const { query } = require('../db');

const VALID_ALERT_TYPES = ['bin_full', 'obstruction', 'other'];

class Alert {
  static async create({ driverId, taskId = null, routeId = null, alertType, message = null }) {
    if (!VALID_ALERT_TYPES.includes(alertType)) {
      throw new Error(`Invalid alert_type "${alertType}". Must be one of: ${VALID_ALERT_TYPES.join(', ')}`);
    }
    const result = await query(
      `INSERT INTO driver_alerts (driver_id, task_id, route_id, alert_type, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING alert_id, driver_id, task_id, route_id, alert_type, message, dispatched_at, acknowledged`,
      [driverId, taskId, routeId, alertType, message]
    );
    return result.rows[0];
  }

  static async findByDriver(driverId, limit = 50) {
    const result = await query(
      `SELECT alert_id, task_id, route_id, alert_type, message, dispatched_at, acknowledged
       FROM driver_alerts WHERE driver_id = $1
       ORDER BY dispatched_at DESC LIMIT $2`,
      [driverId, limit]
    );
    return result.rows;
  }

  static get VALID_ALERT_TYPES() { return VALID_ALERT_TYPES; }
}

module.exports = Alert;
