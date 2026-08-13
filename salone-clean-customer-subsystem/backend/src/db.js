// ============================================================================
// db.js — Local database connection pool for the CUSTOMER SUBSYSTEM ONLY.
//
// Decoupling note: this pool points at this service's own PostgreSQL
// database (see schema.sql). It is never pointed at the Driver or
// Management subsystems' databases. Any data this service needs from them
// is fetched over HTTP through the API Gateway (see utils/gatewayClient.js).
// ============================================================================

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'salone_clean_customers',
  user: process.env.PGUSER || 'customer_service',
  password: process.env.PGPASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  // A background/idle client hit an error — log and let the process
  // supervisor decide whether to restart, rather than crashing silently.
  console.error('[db] Unexpected error on idle PostgreSQL client', err);
});

/**
 * Thin helper so routes don't need to import `pool` directly everywhere.
 * @param {string} text - parameterized SQL
 * @param {Array} params - query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[db] query executed', { text, ms: Date.now() - start, rows: result.rowCount });
  }
  return result;
}

module.exports = { pool, query };
