// ============================================================================
// routeAssignmentRoutes.js — URL wiring for RouteController.
// (Note: "route" here is used in two senses — an Express route (URL handler)
// and a collection route (a driver's daily run). Comments spell out which.)
// ============================================================================

const express = require('express');
const RouteController = require('../controllers/RouteController');
const { validateRouteIngest } = require('../middleware/validators');

const controller = new RouteController();
const router = express.Router();

// GET /api/v1/routes/:driverId — a driver's assigned collection routes for a day
router.get('/:driverId', (req, res) => controller.getAssignedRoutes(req, res));

// GET /api/v1/routes/detail/:routeId — full detail for one collection route
router.get('/detail/:routeId', (req, res) => controller.getRouteDetail(req, res));

// POST /api/v1/routes/ingest — inbound from the API Gateway when Management
// deploys a new route assignment (see Management Subsystem's "Deploy
// Global Route Update").
router.post('/ingest', validateRouteIngest, (req, res) => controller.ingestRouteAssignment(req, res));

module.exports = router;
