// ============================================================================
// driverRoutes.js — URL wiring for DriverController (rider ACCOUNTS —
// see routeAssignmentRoutes.js for what's ASSIGNED to them).
// ============================================================================

const express = require('express');
const DriverController = require('../controllers/DriverController');
const { validateCreateDriver, validateDriverLogin } = require('../middleware/validators');

const controller = new DriverController();
const router = express.Router();

// POST /api/v1/drivers — "Add Rider" (called by the Gateway on Management's behalf)
router.post('/', validateCreateDriver, (req, res) => controller.create(req, res));

// GET /api/v1/drivers — list all riders
router.get('/', (req, res) => controller.list(req, res));

// POST /api/v1/drivers/login — phone-number login for the field app
router.post('/login', validateDriverLogin, (req, res) => controller.login(req, res));

module.exports = router;
