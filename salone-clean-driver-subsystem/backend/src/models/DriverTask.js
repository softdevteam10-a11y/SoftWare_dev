// ============================================================================
// DriverTask.js — Model layer (MVC). Encapsulates all SQL for the
// `driver_tasks` table — the individual pickup stops within a route.
// ============================================================================

const { query } = require('../db');

const VALID_STATUSES = ['pending', 'bin_cleared', 'completed', 'delayed', 'inaccessible'];

class DriverTask {
  /** Lean list of stops for a route, in visit order. */
  static async findByRoute(routeId) {
    const result = await query(
      `SELECT task_id, route_id, customer_reference, sequence_order, address_snapshot,
              neighborhood_tag, status, status_notes, completed_at
       FROM driver_tasks
       WHERE route_id = $1
       ORDER BY sequence_order ASC`,
      [routeId]
    );
    return result.rows;
  }

  static async findById(taskId) {
    const result = await query(
      `SELECT task_id, route_id, customer_reference, sequence_order, address_snapshot,
              neighborhood_tag, status, status_notes, completed_at
       FROM driver_tasks WHERE task_id = $1`,
      [taskId]
    );
    return result.rows[0] || null;
  }

  static async create({ routeId, customerReference = null, sequenceOrder = 0, addressSnapshot, neighborhoodTag }) {
    const result = await query(
      `INSERT INTO driver_tasks (route_id, customer_reference, sequence_order, address_snapshot, neighborhood_tag)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING task_id, route_id, customer_reference, sequence_order, address_snapshot, neighborhood_tag, status`,
      [routeId, customerReference, sequenceOrder, addressSnapshot, neighborhoodTag]
    );
    return result.rows[0];
  }

  /** @returns {Promise<object|null>} the updated row, or null if the task doesn't exist. */
  static async updateStatus(taskId, status, notes = null) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid task status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    const completedAt = ['completed', 'bin_cleared'].includes(status) ? new Date() : null;
    const result = await query(
      `UPDATE driver_tasks
       SET status = $2, status_notes = $3, completed_at = COALESCE($4, completed_at)
       WHERE task_id = $1
       RETURNING task_id, route_id, customer_reference, status, status_notes, completed_at`,
      [taskId, status, notes, completedAt]
    );
    return result.rows[0] || null;
  }

  static get VALID_STATUSES() { return VALID_STATUSES; }
}

module.exports = DriverTask;
