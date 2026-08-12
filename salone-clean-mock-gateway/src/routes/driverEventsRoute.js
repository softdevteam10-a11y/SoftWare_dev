// ============================================================================
// driverEventsRoute.js — Simulates POST /driver-events/* on the real API
// Gateway. The Driver Subsystem's GatewayDispatchObserver posts here for
// every task status change, location ping, and alert.
//
// The important one: /driver-events/task-status. When a driver marks a
// pickup 'completed' or 'bin_cleared' AND the task carries a
// customer_reference (the Customer Subsystem's subscription_id), this
// forwards a notification request to the Customer Subsystem — this is the
// "customer gets notified after the rider checks the trash" link, done as
// a real service-to-service hop through the Gateway, not a direct write.
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { sendSuccess } = require('../utils/apiResponse');

const router = express.Router();

const CUSTOMER_SUBSYSTEM_BASE_URL = process.env.CUSTOMER_SUBSYSTEM_BASE_URL || 'http://localhost:4001/api/v1';

const COMPLETION_STATUSES = ['completed', 'bin_cleared'];

router.post('/task-status', async (req, res) => {
  const { driver_id, customer_reference, status, task_id, notes } = req.body || {};
  console.log(`[mock-gateway] driver-event task-status: driver ${driver_id}, task ${task_id} -> ${status}`);

  if (COMPLETION_STATUSES.includes(status) && customer_reference) {
    try {
      const notifResponse = await fetch(`${CUSTOMER_SUBSYSTEM_BASE_URL}/customers/${customer_reference}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Your bin was collected 🎉',
          message: notes ? `Collection completed. Note from the crew: ${notes}` : 'Your collection crew just cleared your bin.',
          source_subsystem: 'driver-subsystem',
        }),
      });
      if (!notifResponse.ok) {
        console.error('[mock-gateway] Customer Subsystem rejected the notification (unknown customer_reference?)');
      } else {
        console.log(`[mock-gateway] Notified customer ${customer_reference} of pickup completion.`);
      }
    } catch (err) {
      console.error('[mock-gateway] Could not reach the Customer Subsystem to send the notification:', err.message);
      // Don't fail this endpoint over it — the driver's status update itself
      // already succeeded; a missed notification isn't fatal to that.
    }
  }

  return sendSuccess(res, { message: 'Task status event received.' });
});

router.post('/location', (req, res) => {
  console.log(`[mock-gateway] driver-event location: driver ${req.body?.driver_id} @ (${req.body?.latitude}, ${req.body?.longitude})`);
  return sendSuccess(res, { message: 'Location event received.' });
});

router.post('/alert', (req, res) => {
  console.log(`[mock-gateway] driver-event alert: driver ${req.body?.driver_id} raised "${req.body?.alert_type}" — ${req.body?.message || '(no message)'}`);
  return sendSuccess(res, { message: 'Alert event received.' });
});

module.exports = router;
