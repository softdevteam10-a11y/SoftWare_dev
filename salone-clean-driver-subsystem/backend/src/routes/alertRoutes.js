// ============================================================================
// alertRoutes.js — URL wiring for AlertController.
// ============================================================================

const express = require('express');
const AlertController = require('../controllers/AlertController');
const { validateAlert } = require('../middleware/validators');

/** @param {import('../patterns/observers/DispatchEventPublisher')} publisher */
module.exports = function createAlertRoutes(publisher) {
  const controller = new AlertController(publisher);
  const router = express.Router();

  // POST /api/v1/alerts — 'bin_full' | 'obstruction' | 'other'
  router.post('/', validateAlert, (req, res) => controller.raiseAlert(req, res));

  // GET /api/v1/alerts/:driverId — recent alerts raised by a driver
  router.get('/:driverId', (req, res) => controller.listByDriver(req, res));

  return router;
};
