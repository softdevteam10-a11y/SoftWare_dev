// ============================================================================
// SyncController.js — Controller layer (MVC).
//
// Network Optimization: field connectivity is unreliable, so the client is
// expected to queue task-status updates, location pings, and alerts
// locally while offline, then submit them here as ONE batch when signal
// returns — far cheaper than one round trip per event. Each item in the
// batch is applied through the same Model + Observer pipeline as the
// live/single-item endpoints, so behavior is identical either way.
// ============================================================================

const DriverTask = require('../models/DriverTask');
const LocationPing = require('../models/LocationPing');
const Alert = require('../models/Alert');
const StatusQueueItem = require('../models/StatusQueueItem');
const { sendSuccess, sendError } = require('../utils/apiResponse');

class SyncController {
  /** @param {import('../patterns/observers/DispatchEventPublisher')} publisher */
  constructor(publisher) {
    this.publisher = publisher;
  }

  /**
   * POST /api/v1/sync
   * Body: { driver_id, items: [{ type: 'task_status'|'location_ping'|'alert', payload: {...} }] }
   * Applies each queued item and returns a per-item result so the client
   * can clear only the ones that actually succeeded from its local queue.
   */
  async batchSync(req, res) {
    const { driver_id, items } = req.body;
    const results = [];

    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await this._applyOne(driver_id, item);
        results.push({ ok: true, type: item.type, result });
      } catch (err) {
        results.push({ ok: false, type: item.type, error: err.message });
      }
    }

    const succeeded = results.filter((r) => r.ok).length;
    return sendSuccess(res, {
      message: `Synced ${succeeded}/${items.length} queued item(s).`,
      data: { results },
    });
  }

  /**
   * GET /api/v1/sync/pending/:driverId
   * Retries anything that's still sitting in status_update_queue from an
   * earlier failed Gateway dispatch (see GatewayDispatchObserver).
   */
  async retryPending(req, res) {
    const { driverId } = req.params;
    try {
      const pending = await StatusQueueItem.findPendingByDriver(driverId);
      const results = [];

      for (const queued of pending) {
        const payload = JSON.parse(queued.payload_json);
        // eslint-disable-next-line no-await-in-loop
        const dispatchResults = await this.publisher.notify({
          type: queued.payload_type,
          driverId,
          occurredAt: queued.created_at,
          payload,
        });
        const anySucceeded = dispatchResults.some((r) => r.ok);
        if (anySucceeded) {
          // eslint-disable-next-line no-await-in-loop
          await StatusQueueItem.markSynced(queued.queue_id);
        }
        results.push({ queue_id: queued.queue_id, type: queued.payload_type, dispatch: dispatchResults });
      }

      return sendSuccess(res, { message: `Retried ${pending.length} queued item(s).`, data: { results } });
    } catch (err) {
      console.error('[SyncController] retryPending failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not retry pending sync items.' });
    }
  }

  /** @private */
  async _applyOne(driverId, item) {
    const { type, payload } = item;

    if (type === 'task_status') {
      const task = await DriverTask.updateStatus(payload.task_id, payload.status, payload.notes || null);
      if (!task) throw new Error(`Task ${payload.task_id} not found`);
      await this.publisher.notify({
        type: 'task_status',
        driverId,
        occurredAt: new Date(),
        payload: { task_id: task.task_id, route_id: task.route_id, customer_reference: task.customer_reference, status: task.status, notes: task.status_notes },
      });
      return task;
    }

    if (type === 'location_ping') {
      const ping = await LocationPing.create({ driverId, routeId: payload.route_id || null, latitude: payload.latitude, longitude: payload.longitude, recordedAt: payload.recorded_at || null });
      await this.publisher.notify({
        type: 'location_ping',
        driverId,
        occurredAt: ping.recorded_at,
        payload: { route_id: ping.route_id, latitude: ping.latitude, longitude: ping.longitude },
      });
      return ping;
    }

    if (type === 'alert') {
      const alert = await Alert.create({ driverId, taskId: payload.task_id || null, routeId: payload.route_id || null, alertType: payload.alert_type, message: payload.message || null });
      await this.publisher.notify({
        type: 'alert',
        driverId,
        occurredAt: alert.dispatched_at,
        payload: { alert_id: alert.alert_id, task_id: alert.task_id, route_id: alert.route_id, alert_type: alert.alert_type, message: alert.message },
      });
      return alert;
    }

    throw new Error(`Unknown queued item type "${type}"`);
  }
}

module.exports = SyncController;
