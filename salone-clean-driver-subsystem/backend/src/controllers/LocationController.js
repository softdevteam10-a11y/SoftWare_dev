// ============================================================================
// LocationController.js — Controller layer (MVC).
// Records a lean location ping and publishes it through the Observer
// pipeline so the platform can track "trucks en route" without this
// subsystem needing to know who's watching.
// ============================================================================

const LocationPing = require('../models/LocationPing');
const { sendSuccess, sendError } = require('../utils/apiResponse');

class LocationController {
  /** @param {import('../patterns/observers/DispatchEventPublisher')} publisher */
  constructor(publisher) {
    this.publisher = publisher;
  }

  /** POST /api/v1/locations */
  async recordPing(req, res) {
    const { driver_id, route_id = null, latitude, longitude, recorded_at = null } = req.body;

    try {
      const ping = await LocationPing.create({ driverId: driver_id, routeId: route_id, latitude, longitude, recordedAt: recorded_at });

      const dispatchResults = await this.publisher.notify({
        type: 'location_ping',
        driverId: driver_id,
        occurredAt: ping.recorded_at,
        payload: { route_id: ping.route_id, latitude: ping.latitude, longitude: ping.longitude },
      });

      return sendSuccess(res, { statusCode: 201, message: 'Location recorded.', data: { ping, dispatch: dispatchResults } });
    } catch (err) {
      console.error('[LocationController] recordPing failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not record location ping.' });
    }
  }

  /** GET /api/v1/locations/:driverId/latest */
  async getLatest(req, res) {
    try {
      const ping = await LocationPing.findLatestByDriver(req.params.driverId);
      if (!ping) {
        return sendError(res, { statusCode: 404, code: 'NO_LOCATION_YET', message: 'No location pings recorded for this driver yet.' });
      }
      return sendSuccess(res, { data: ping });
    } catch (err) {
      console.error('[LocationController] getLatest failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not fetch latest location.' });
    }
  }
}

module.exports = LocationController;
