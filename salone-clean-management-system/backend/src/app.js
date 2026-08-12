// ============================================================================
// app.js — Express application for the Management Subsystem.
// This process owns ONE concern: municipal admin oversight, configuration
// broadcast, and compliance auditing — no direct access to customer or
// driver data stores.
// ============================================================================

const express = require('express');
const cors = require('cors');

const { sendError, sendSuccess } = require('./utils/apiResponse');
const analyticsRoutes = require('./routes/analyticsRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const auditRoutes = require('./routes/auditRoutes');
const fleetRoutes = require('./routes/fleetRoutes');

const app = express();

// --- Core middleware --------------------------------------------------------
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

// --- Health check (used by the API Gateway / load balancer) ---------------
app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'management-subsystem', status: 'healthy' } }));

// --- Routes (namespaced under /api/v1, matching the Gateway's contract) ----
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/compliance', complianceRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/fleet', fleetRoutes);

const neighborhoods = data.neighborhoods || [];
const count = neighborhoods.length;

// --- 404 fallback ------------------------------------------------------------
app.use((req, res) => {
  return sendError(res, { statusCode: 404, code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` });
});

// --- Centralized error handler ----------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[app] Unhandled error', err);
  return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong on our end.' });
});

module.exports = app;
