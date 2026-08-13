// ============================================================================
// db.js — Local database connection pool for the DRIVER SUBSYSTEM ONLY.
// Never pointed at the Customer or Management subsystems' databases.
// ============================================================================

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'salone_clean_driver',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
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
