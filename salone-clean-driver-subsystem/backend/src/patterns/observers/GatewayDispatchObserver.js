// ============================================================================
// GatewayDispatchObserver.js — Concrete Observer.
//
// Single Responsibility: ensure a driver event actually reaches the rest of
// the platform. That means three closely-related steps in service of one
// goal — attempt Gateway delivery; if the network/Gateway isn't available
// right now, fall back to the local offline queue instead of losing the
// event; either way, record the outcome in this subsystem's own audit log.
//
// Dependency Inversion: this class depends on the `gatewayClient` module
// (an abstraction over "how we reach the Gateway") and the `StatusQueueItem`
// / `DispatchLog` models (abstractions over "how we persist locally") —
// never on raw fetch/SQL details itself.
// ============================================================================

const Observer = require('./Observer');
const { postToGateway } = require('../../utils/gatewayClient');
const StatusQueueItem = require('../../models/StatusQueueItem');
const DispatchLog = require('../../models/DispatchLog');

// Maps our internal event types to the Gateway path that represents them.
const GATEWAY_PATHS = {
  task_status: '/driver-events/task-status',
  location_ping: '/driver-events/location',
  alert: '/driver-events/alert',
};

class GatewayDispatchObserver extends Observer {
  async update(event) {
    const gatewayPath = GATEWAY_PATHS[event.type];
    if (!gatewayPath) {
      throw new Error(`No Gateway route configured for event type "${event.type}"`);
    }

    const gatewayPayload = {
      source_subsystem: 'driver-subsystem',
      driver_id: event.driverId,
      occurred_at: event.occurredAt,
      ...event.payload,
    };

    const response = await postToGateway(gatewayPath, gatewayPayload);

    if (response.ok) {
      await DispatchLog.record({ eventType: event.type, payload: gatewayPayload, dispatchStatus: 'success' });
      return;
    }

    // Gateway unreachable or rejected it — don't lose the event. Queue it
    // locally so a later sync (see SyncController) can retry it, matching
    // the "basic status queuing" requirement for unreliable field networks.
    await StatusQueueItem.enqueue({
      driverId: event.driverId,
      payloadType: event.type,
      payload: gatewayPayload,
    });
    await DispatchLog.record({ eventType: event.type, payload: gatewayPayload, dispatchStatus: 'queued' });
  }
}

module.exports = GatewayDispatchObserver;
