// ============================================================================
// TaskController.js — Controller layer (MVC).
//
// Handles job status updates from the field ('bin_cleared', 'completed',
// 'delayed', 'inaccessible'). Every status change is published through the
// injected DispatchEventPublisher (Observer Pattern) so the rest of the
// platform hears about it — this controller has no idea how many observers
// are listening or what they do with the event (Dependency Inversion).
// ============================================================================

const DriverTask = require('../models/DriverTask');
const { sendSuccess, sendError } = require('../utils/apiResponse');

class TaskController {
  /** @param {import('../patterns/observers/DispatchEventPublisher')} publisher */
  constructor(publisher) {
    this.publisher = publisher;
  }

  /** PATCH /api/v1/tasks/:taskId/status */
  async updateStatus(req, res) {
    const { taskId } = req.params;
    const { status, notes = null } = req.body;

    try {
      const task = await DriverTask.updateStatus(taskId, status, notes);
      if (!task) {
        return sendError(res, { statusCode: 404, code: 'TASK_NOT_FOUND', message: 'No task found with that ID.' });
      }

      const dispatchResults = await this.publisher.notify({
        type: 'task_status',
        driverId: req.body.driver_id || null,
        occurredAt: new Date(),
        payload: {
          task_id: task.task_id,
          route_id: task.route_id,
          customer_reference: task.customer_reference,
          status: task.status,
          notes: task.status_notes,
        },
      });

      return sendSuccess(res, {
        message: `Task marked "${task.status}".`,
        data: { task, dispatch: dispatchResults },
      });
    } catch (err) {
      console.error('[TaskController] updateStatus failed', err);
      return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Could not update task status.' });
    }
  }
}

module.exports = TaskController;
