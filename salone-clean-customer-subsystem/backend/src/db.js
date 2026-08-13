// ============================================================================
// db.js — Local database connection pool for the CUSTOMER SUBSYSTEM ONLY.
//
// Decoupling note: this pool points at this service's own PostgreSQL
// database (see schema.sql). It is never pointed at the Driver or
// Management subsystems' databases. Any data this service needs from them
// is fetched over HTTP through the API Gateway (see utils/gatewayClient.js).
//
// Two ways to configure this, so the same code works locally and on Render:
//   1. DATABASE_URL — a single Postgres connection string, e.g. Neon's
//      "postgres://user:pass@host/dbname?sslmode=require". If this is set,
//      it takes priority and SSL is enabled automatically (Neon requires it).
//   2. Discrete PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD — used for local
//      Postgres. Set PGSSL=true alongside these if that database also
//      requires SSL (e.g. a managed Postgres that isn't Neon).
// ============================================================================

const { Pool } = require('pg');

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Neon (and most managed Postgres) requires SSL
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'salone_clean_customers',
    user: process.env.PGUSER || 'customer_service',
    password: process.env.PGPASSWORD || '',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const pool = new Pool({
  ...buildPoolConfig(),
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
