// ============================================================================
// taskRoutes.js — URL wiring for TaskController.
// Exported as a factory function so app.js can inject the shared
// DispatchEventPublisher (Dependency Injection, no framework/container needed).
// ============================================================================

const express = require('express');
const TaskController = require('../controllers/TaskController');
const { validateTaskStatusUpdate } = require('../middleware/validators');

/** @param {import('../patterns/observers/DispatchEventPublisher')} publisher */
module.exports = function createTaskRoutes(publisher) {
  const controller = new TaskController(publisher);
  const router = express.Router();

  // PATCH /api/v1/tasks/:taskId/status — 'bin_cleared' | 'completed' | 'delayed' | 'inaccessible'
  router.patch('/:taskId/status', validateTaskStatusUpdate, (req, res) => controller.updateStatus(req, res));

  return router;
};
