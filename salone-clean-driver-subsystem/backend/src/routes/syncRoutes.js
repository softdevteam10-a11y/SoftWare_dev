// ============================================================================
// syncRoutes.js — URL wiring for SyncController.
// ============================================================================

const express = require('express');
const SyncController = require('../controllers/SyncController');
const { validateSyncBatch } = require('../middleware/validators');

/** @param {import('../patterns/observers/DispatchEventPublisher')} publisher */
module.exports = function createSyncRoutes(publisher) {
  const controller = new SyncController(publisher);
  const router = express.Router();

  // POST /api/v1/sync — submit a batch of updates queued while offline
  router.post('/', validateSyncBatch, (req, res) => controller.batchSync(req, res));

  // GET /api/v1/sync/pending/:driverId — retry anything still queued from a
  // failed Gateway dispatch (see GatewayDispatchObserver)
  router.get('/pending/:driverId', (req, res) => controller.retryPending(req, res));

  return router;
};
