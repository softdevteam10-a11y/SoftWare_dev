// ============================================================================
// db.js — Local database connection pool for the MANAGEMENT SUBSYSTEM ONLY.
//
// Decoupling note: this pool points at this service's own PostgreSQL
// database (see schema.sql — just `system_compliance_logs`). It is never
// pointed at the Customer or Driver subsystems' databases. Anything this
// service needs from them travels over HTTP through the API Gateway
// (see utils/gatewayClient.js).
// ============================================================================

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'salone_clean_management',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle PostgreSQL client', err);
});

/**
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
