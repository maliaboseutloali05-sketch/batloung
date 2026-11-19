'use strict';
const mysql = require('mysql2/promise');
const config = require('./env');

// A pool does not connect until the first query, so creating it can never crash the process.
const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  connectTimeout: 10000,
  dateStrings: true,      // return DATE/DATETIME as plain strings -> no timezone surprises
  ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
});

/** Run one statement on the pool. We use query() (not execute()) so LIMIT ? and IN (?) work. */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Run a statement on a given transaction connection, or on the pool when no connection is given. */
async function run(conn, sql, params = []) {
  const [rows] = await (conn || pool).query(sql, params);
  return rows;
}

/**
 * Run `work(conn)` inside ONE database transaction.
 *   BEGIN -> work -> COMMIT      when work resolves
 *   BEGIN -> work -> ROLLBACK    when work throws (the error is re-thrown afterwards)
 * The connection is always returned to the pool.
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.query('BEGIN');
    const result = await work(conn);
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await conn.query('ROLLBACK');
    } catch (rollbackErr) {
      // A failed rollback usually means the connection is already gone; MySQL then
      // rolls back by itself. Log it, but surface the ORIGINAL error to the caller.
      console.error('[db] ROLLBACK failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** Health probe used at start-up and by GET /api/health. Never throws. */
async function checkConnection() {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, code: err.code || 'UNKNOWN', message: err.message };
  }
}

async function closePool() {
  try {
    await pool.end();
  } catch (err) {
    console.error('[db] error while closing the pool:', err.message);
  }
}

module.exports = { pool, query, run, withTransaction, checkConnection, closePool };
