// ============================================================================
// locationRoutes.js — URL wiring for LocationController.
// ============================================================================

const express = require('express');
const LocationController = require('../controllers/LocationController');
const { validateLocationPing } = require('../middleware/validators');

/** @param {import('../patterns/observers/DispatchEventPublisher')} publisher */
module.exports = function createLocationRoutes(publisher) {
  const controller = new LocationController(publisher);
  const router = express.Router();

  // POST /api/v1/locations — lean {driver_id, latitude, longitude} ping
  router.post('/', validateLocationPing, (req, res) => controller.recordPing(req, res));

  // GET /api/v1/locations/:driverId/latest — last known position
  router.get('/:driverId/latest', (req, res) => controller.getLatest(req, res));

  return router;
};
