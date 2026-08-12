// ============================================================================
// app.js — Express application for the Customer Subsystem.
// This process owns ONE concern: customer accounts, token purchases, and
// history — nothing about drivers, routes, or fleet management lives here.
// ============================================================================

const express = require('express');
const cors = require('cors');

const { sendError, sendSuccess } = require('./utils/apiResponse');
const customerRoutes = require('./routes/customerRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// --- Core middleware --------------------------------------------------------
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' })); // signature_data (base64 PNG) can be a few KB-hundreds of KB

// --- Health check (used by the API Gateway / load balancer) ---------------
app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'customer-subsystem', status: 'healthy' } }));

// --- Routes (all namespaced under /api/v1, matching the Gateway's contract) -
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/purchases', purchaseRoutes);
app.use('/api/v1/payments', paymentRoutes);

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
