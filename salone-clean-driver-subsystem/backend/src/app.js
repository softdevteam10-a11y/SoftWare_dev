// ============================================================================
// app.js — Express application for the Driver Subsystem.
//
// This is the composition root: the ONE place that constructs the
// DispatchEventPublisher (Subject) and subscribes its observers. Every
// controller that needs to publish events receives the already-wired
// publisher via constructor injection — no controller or model ever
// constructs an observer or knows the observer list. This is what makes it
// possible to add a new observer (e.g. an SMS notifier) by editing only
// this file.
// ============================================================================

const express = require('express');
const cors = require('cors');

const { sendError, sendSuccess } = require('./utils/apiResponse');

const DispatchEventPublisher = require('./patterns/observers/DispatchEventPublisher');
const GatewayDispatchObserver = require('./patterns/observers/GatewayDispatchObserver');
const AlertEscalationObserver = require('./patterns/observers/AlertEscalationObserver');

const routeAssignmentRoutes = require('./routes/routeAssignmentRoutes');
const driverRoutes = require('./routes/driverRoutes');
const createTaskRoutes = require('./routes/taskRoutes');
const createLocationRoutes = require('./routes/locationRoutes');
const createAlertRoutes = require('./routes/alertRoutes');
const createSyncRoutes = require('./routes/syncRoutes');

// --- Composition root: build the Subject and subscribe its Observers -------
const publisher = new DispatchEventPublisher();
publisher.subscribe(new GatewayDispatchObserver());   // delivers events to the platform via the Gateway, queueing on failure
publisher.subscribe(new AlertEscalationObserver());   // flags urgent bin_full/obstruction alerts for on-duty visibility

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '512kb' })); // payloads are deliberately lean — see schema.sql comments

app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'driver-subsystem', status: 'healthy' } }));

app.use('/api/v1/routes', routeAssignmentRoutes);
app.use('/api/v1/drivers', driverRoutes);
app.use('/api/v1/tasks', createTaskRoutes(publisher));
app.use('/api/v1/locations', createLocationRoutes(publisher));
app.use('/api/v1/alerts', createAlertRoutes(publisher));
app.use('/api/v1/sync', createSyncRoutes(publisher));

app.use((req, res) => sendError(res, { statusCode: 404, code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[app] Unhandled error', err);
  return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong on our end.' });
});

module.exports = app;
