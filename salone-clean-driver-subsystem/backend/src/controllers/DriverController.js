// ============================================================================
// DriverController.js — Controller layer (MVC).
//
// Manages driver ("rider") accounts themselves — separate from
// RouteController, which manages what's assigned to a driver. This is what
// backs Management's "Add Rider" feature: Management never writes into
// this subsystem's database directly, it calls the Gateway, which calls
// POST /api/v1/drivers here.
//
// Auth note: driver accounts are provisioned by Management (via the
// Gateway), not self-registered like customers, so login here is
// deliberately simple — phone number only, no PIN. A real deployment
// should add a PIN or a Gateway-issued session token, same as the
// Customer Subsystem's login.
// ============================================================================

const Driver = require('../models/Driver');
const { sendSuccess, sendError } = require('../utils/apiResponse');

class DriverController {
  /** POST /api/v1/drivers — "Add Rider" */
  async create(req, res) {
    const { full_name, phone_number, vehicle_label = null } = req.body;
    try {
      const driver = await Driver.create({ fullName: full_name, phoneNumber: phone_number, vehicleLabel: vehicle_label });
      return sendSuccess(res, { statusCode: 201, message: `Rider ${driver.full_name} added.`, data: driver });
    } catch (err) {
      if (err.code === '23505') {
        return sendError(res, { statusCode: 409, code: 'PHONE_ALREADY_REGISTERED', message: 'A rider with this phone number already exists.' });
      }
      console.error('[DriverController] create failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not add rider.' });
    }
  }

  /** GET /api/v1/drivers — list all riders (e.g. for Management's assignee picker) */
  async list(req, res) {
    try {
      const drivers = await Driver.findAll();
      return sendSuccess(res, { data: drivers });
    } catch (err) {
      console.error('[DriverController] list failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not load riders.' });
    }
  }

  /** POST /api/v1/drivers/login — phone-number lookup for the field app */
  async login(req, res) {
    const { phone_number } = req.body;
    try {
      const driver = await Driver.findByPhone(phone_number);
      if (!driver) {
        return sendError(res, { statusCode: 404, code: 'DRIVER_NOT_FOUND', message: 'No rider account found with that phone number. Ask a manager to add you.' });
      }
      return sendSuccess(res, { message: `Welcome, ${driver.full_name.split(' ')[0]}.`, data: driver });
    } catch (err) {
      console.error('[DriverController] login failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not log in.' });
    }
  }
}

module.exports = DriverController;
