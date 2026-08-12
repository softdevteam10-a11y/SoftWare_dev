// ============================================================================
// StatusQueueItem.js — Model layer (MVC). Encapsulates all SQL for
// `status_update_queue`, the offline-first queuing table. When the field
// client has no signal, it can queue task-status updates, location pings,
// and alerts client-side and POST them as one batch to /api/v1/sync once
// connectivity returns — this model backs that server-side record-keeping.
// ============================================================================

const { query } = require('../db');

const VALID_PAYLOAD_TYPES = ['task_status', 'location_ping', 'alert'];

class StatusQueueItem {
  static async enqueue({ driverId, payloadType, payload }) {
    if (!VALID_PAYLOAD_TYPES.includes(payloadType)) {
      throw new Error(`Invalid payload_type "${payloadType}". Must be one of: ${VALID_PAYLOAD_TYPES.join(', ')}`);
    }
    const result = await query(
      `INSERT INTO status_update_queue (driver_id, payload_type, payload_json)
       VALUES ($1, $2, $3)
       RETURNING queue_id, driver_id, payload_type, sync_status, created_at`,
      [driverId, payloadType, JSON.stringify(payload)]
    );
    return result.rows[0];
  }

  static async markSynced(queueId) {
    await query(
      `UPDATE status_update_queue SET sync_status = 'synced', synced_at = now() WHERE queue_id = $1`,
      [queueId]
    );
  }

  static async markFailed(queueId) {
    await query(
      `UPDATE status_update_queue SET sync_status = 'failed', synced_at = now() WHERE queue_id = $1`,
      [queueId]
    );
  }

  static async findPendingByDriver(driverId) {
    const result = await query(
      `SELECT queue_id, payload_type, payload_json, created_at
       FROM status_update_queue
       WHERE driver_id = $1 AND sync_status = 'pending'
       ORDER BY created_at ASC`,
      [driverId]
    );
    return result.rows;
  }

  static get VALID_PAYLOAD_TYPES() { return VALID_PAYLOAD_TYPES; }
}

module.exports = StatusQueueItem;
