// ============================================================================
// db.js — Local database connection pool for the DRIVER SUBSYSTEM ONLY.
// Never pointed at the Customer or Management subsystems' databases.
//
// Two ways to configure this, so the same code works locally and on Render:
//   1. DATABASE_URL — a single Postgres connection string, e.g. Neon's
//      "postgres://user:pass@host/dbname?sslmode=require". If this is set,
//      it takes priority and SSL is enabled automatically (Neon requires it).
//   2. Discrete PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD — used for local
//      Postgres. Set PGSSL=true alongside these if that database also
//      requires SSL (e.g. a managed Postgres that isn't Neon).
//
// If neither is set correctly, connections fail with ECONNREFUSED against
// 127.0.0.1:5432 — that's the pg driver's built-in default, which only
// makes sense for local development, never for a deployed environment.
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
    database: process.env.PGDATABASE || 'salone_clean_driver',
    user: process.env.PGUSER || 'postgres',
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
  console.error('[db] Unexpected error on idle PostgreSQL client', err);
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[db] query executed', { text, ms: Date.now() - start, rows: result.rowCount });
  }
  return result;
}

module.exports = { pool, query };
