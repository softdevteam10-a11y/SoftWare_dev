// ============================================================================
// AlertController.js — Controller layer (MVC).
// Raises field alerts ('bin_full', 'obstruction', 'other') and publishes
// them through the Observer pipeline. GatewayDispatchObserver forwards the
// alert to the platform; AlertEscalationObserver additionally flags urgent
// ones for on-duty visibility — this controller doesn't know either of
// those observers exist.
// ============================================================================

const Alert = require('../models/Alert');
const { sendSuccess, sendError } = require('../utils/apiResponse');

class AlertController {
  /** @param {import('../patterns/observers/DispatchEventPublisher')} publisher */
  constructor(publisher) {
    this.publisher = publisher;
  }

  /** POST /api/v1/alerts */
  async raiseAlert(req, res) {
    const { driver_id, task_id = null, route_id = null, alert_type, message = null } = req.body;

    try {
      const alert = await Alert.create({ driverId: driver_id, taskId: task_id, routeId: route_id, alertType: alert_type, message });

      const dispatchResults = await this.publisher.notify({
        type: 'alert',
        driverId: driver_id,
        occurredAt: alert.dispatched_at,
        payload: { alert_id: alert.alert_id, task_id: alert.task_id, route_id: alert.route_id, alert_type: alert.alert_type, message: alert.message },
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: `Alert "${alert.alert_type}" raised and dispatched.`,
        data: { alert, dispatch: dispatchResults },
      });
    } catch (err) {
      console.error('[AlertController] raiseAlert failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not raise alert.' });
    }
  }

  /** GET /api/v1/alerts/:driverId */
  async listByDriver(req, res) {
    try {
      const alerts = await Alert.findByDriver(req.params.driverId);
      return sendSuccess(res, { data: alerts });
    } catch (err) {
      console.error('[AlertController] listByDriver failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load alerts.' });
    }
  }
}

module.exports = AlertController;
