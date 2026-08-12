// ============================================================================
// DriverRoute.js — Model layer (MVC). Encapsulates all SQL for the
// `driver_routes` table.
// ============================================================================

const { query } = require('../db');

class DriverRoute {
  /** Today's (or a given date's) routes for a driver — lean fields only. */
  static async findByDriverAndDate(driverId, date) {
    const result = await query(
      `SELECT route_id, route_name, neighborhood_tags, scheduled_date, status, source_dispatch_id
       FROM driver_routes
       WHERE driver_id = $1 AND scheduled_date = $2
       ORDER BY created_at ASC`,
      [driverId, date]
    );
    return result.rows;
  }

  static async findById(routeId) {
    const result = await query(
      `SELECT route_id, driver_id, route_name, neighborhood_tags, scheduled_date, status, source_dispatch_id, created_at
       FROM driver_routes WHERE route_id = $1`,
      [routeId]
    );
    return result.rows[0] || null;
  }

  /** Used when Management dispatches a new route assignment via the Gateway. */
  static async create({ driverId, routeName, neighborhoodTags = [], scheduledDate, sourceDispatchId = null }) {
    const result = await query(
      `INSERT INTO driver_routes (driver_id, route_name, neighborhood_tags, scheduled_date, source_dispatch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING route_id, driver_id, route_name, neighborhood_tags, scheduled_date, status, source_dispatch_id`,
      [driverId, routeName, neighborhoodTags, scheduledDate, sourceDispatchId]
    );
    return result.rows[0];
  }

  static async updateStatus(routeId, status) {
    const result = await query(
      `UPDATE driver_routes SET status = $2 WHERE route_id = $1
       RETURNING route_id, status`,
      [routeId, status]
    );
    return result.rows[0] || null;
  }
}

module.exports = DriverRoute;
