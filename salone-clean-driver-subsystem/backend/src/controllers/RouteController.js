// ============================================================================
// RouteController.js — Controller layer (MVC).
//
// Handles: (1) drivers fetching their assigned routes/tasks, and (2) the
// Gateway pushing a NEW route assignment into this subsystem when
// Management deploys a route update — this is what closes the loop
// described in the Management Subsystem's "Deploy Global Route Update"
// feature, without this subsystem ever touching Management's database.
// ============================================================================

const DriverRoute = require('../models/DriverRoute');
const DriverTask = require('../models/DriverTask');
const Driver = require('../models/Driver');
const { sendSuccess, sendError } = require('../utils/apiResponse');

class RouteController {
  /**
   * GET /api/v1/routes/:driverId?date=YYYY-MM-DD
   * Lean payload: only what a field crew needs to start their day.
   */
  async getAssignedRoutes(req, res) {
    const { driverId } = req.params;
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    try {
      const routes = await DriverRoute.findByDriverAndDate(driverId, date);
      const routesWithTasks = await Promise.all(
        routes.map(async (route) => ({
          ...route,
          tasks: await DriverTask.findByRoute(route.route_id),
        }))
      );
      return sendSuccess(res, { data: routesWithTasks });
    } catch (err) {
      console.error('[RouteController] getAssignedRoutes failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load assigned routes.' });
    }
  }

  /** GET /api/v1/routes/detail/:routeId */
  async getRouteDetail(req, res) {
    const { routeId } = req.params;
    try {
      const route = await DriverRoute.findById(routeId);
      if (!route) {
        return sendError(res, { statusCode: 404, code: 'ROUTE_NOT_FOUND', message: 'No route found with that ID.' });
      }
      const tasks = await DriverTask.findByRoute(routeId);
      return sendSuccess(res, { data: { ...route, tasks } });
    } catch (err) {
      console.error('[RouteController] getRouteDetail failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load route detail.' });
    }
  }

  /**
   * POST /api/v1/routes/ingest
   * Inbound endpoint the API Gateway calls when Management dispatches a new
   * route assignment. Auto-provisions the driver record if this is the
   * first time we've seen that phone number (a real deployment would
   * instead reject unknown drivers and require pre-registration — kept
   * permissive here to make local testing straightforward).
   */
  async ingestRouteAssignment(req, res) {
    const { driver_phone_number, driver_name, route_name, neighborhood_tags = [], scheduled_date, source_dispatch_id, tasks } = req.body;

    try {
      let driver = await Driver.findByPhone(driver_phone_number);
      if (!driver) {
        driver = await Driver.create({ fullName: driver_name || 'Unassigned Driver', phoneNumber: driver_phone_number });
      }

      const route = await DriverRoute.create({
        driverId: driver.driver_id,
        routeName: route_name,
        neighborhoodTags: neighborhood_tags,
        scheduledDate: scheduled_date,
        sourceDispatchId: source_dispatch_id || null,
      });

      const createdTasks = [];
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        // eslint-disable-next-line no-await-in-loop
        const created = await DriverTask.create({
          routeId: route.route_id,
          customerReference: t.customer_reference || null,
          sequenceOrder: t.sequence_order ?? i,
          addressSnapshot: t.address_snapshot,
          neighborhoodTag: t.neighborhood_tag,
        });
        createdTasks.push(created);
      }

      return sendSuccess(res, {
        statusCode: 201,
        message: `Route "${route_name}" assigned to ${driver.full_name} with ${createdTasks.length} stop(s).`,
        data: { ...route, tasks: createdTasks },
      });
    } catch (err) {
      console.error('[RouteController] ingestRouteAssignment failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not ingest route assignment.' });
    }
  }
}

module.exports = RouteController;
