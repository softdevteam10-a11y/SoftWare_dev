// ============================================================================
// LocationPing.js — Model layer (MVC). Encapsulates all SQL for
// `driver_location_pings`. Kept intentionally narrow (lat/lng/time) to
// match the lean-payload requirement for field mobile connections.
// ============================================================================

const { query } = require('../db');

class LocationPing {
  static async create({ driverId, routeId = null, latitude, longitude, recordedAt = null }) {
    const result = await query(
      `INSERT INTO driver_location_pings (driver_id, route_id, latitude, longitude, recorded_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, now()))
       RETURNING ping_id, driver_id, route_id, latitude, longitude, recorded_at`,
      [driverId, routeId, latitude, longitude, recordedAt]
    );
    return result.rows[0];
  }

  /** Most recent ping for a driver — used to show "last known location". */
  static async findLatestByDriver(driverId) {
    const result = await query(
      `SELECT ping_id, route_id, latitude, longitude, recorded_at
       FROM driver_location_pings
       WHERE driver_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [driverId]
    );
    return result.rows[0] || null;
  }
}

module.exports = LocationPing;
