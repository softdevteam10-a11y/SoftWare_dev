// ============================================================================
// AlertEscalationObserver.js — Concrete Observer.
//
// Single Responsibility: react to urgent field alerts (bin_full,
// obstruction) with extra visibility — in this reference implementation,
// a structured console warning; in production this is the natural place
// to plug in SMS/push notifications to on-duty dispatch staff.
//
// This class demonstrates the Open/Closed Principle in action: it was
// added purely by subscribing a new observer in app.js. Neither
// DispatchEventPublisher, GatewayDispatchObserver, nor any controller had
// to change to support it. It also demonstrates Liskov Substitution: it
// implements the exact same `update(event)` contract as
// GatewayDispatchObserver, so the publisher treats both identically.
// ============================================================================

const Observer = require('./Observer');

const URGENT_ALERT_TYPES = ['bin_full', 'obstruction'];

class AlertEscalationObserver extends Observer {
  async update(event) {
    if (event.type !== 'alert') return; // not this observer's concern
    if (!URGENT_ALERT_TYPES.includes(event.payload.alert_type)) return;

    // Reference implementation only — swap this for a real SMS/push
    // notification integration (itself reached via the Gateway, per the
    // decoupling rule) when one is available.
    console.warn(
      `[AlertEscalationObserver] URGENT ${event.payload.alert_type.toUpperCase()} — ` +
      `driver ${event.driverId}, route ${event.payload.route_id || 'n/a'}, task ${event.payload.task_id || 'n/a'}: ` +
      `${event.payload.message || '(no message)'}`
    );
  }
}

module.exports = AlertEscalationObserver;
