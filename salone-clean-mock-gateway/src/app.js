// ============================================================================
// app.js — Mock API Gateway Express app. FOR LOCAL DEVELOPMENT/TESTING ONLY.
// ============================================================================

const express = require('express');
const cors = require('cors');
const { sendSuccess, sendError } = require('./utils/apiResponse');

const paymentsRoute = require('./routes/paymentsRoute');
const routesRoute = require('./routes/routesRoute');
const analyticsRoute = require('./routes/analyticsRoute');
const driverEventsRoute = require('./routes/driverEventsRoute');
const customersProxyRoute = require('./routes/customersProxyRoute');
const driversProxyRoute = require('./routes/driversProxyRoute');

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'mock-api-gateway', status: 'healthy' } }));

app.use('/api/v1/payments', paymentsRoute);
app.use('/api/v1/routes', routesRoute);
app.use('/api/v1/analytics', analyticsRoute);
app.use('/api/v1/driver-events', driverEventsRoute);
app.use('/api/v1/customers', customersProxyRoute);
app.use('/api/v1/drivers', driversProxyRoute);

app.use((req, res) => sendError(res, { statusCode: 404, code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[mock-gateway] Unhandled error', err);
  return sendError(res, { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong in the mock gateway.' });
});

module.exports = app;
