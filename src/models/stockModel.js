'use strict';
const { query } = require('../config/database');

const ORDER = "ORDER BY f.fruit_name, FIELD(s.packaging_size, 'SMALL', 'MEDIUM', 'LARGE')";
const SELECT = `SELECT s.stock_id, f.fruit_id, f.fruit_name, s.packaging_size,
                       s.available_quantity, s.reorder_level,
                       (s.available_quantity <= s.reorder_level) AS is_low_stock
                FROM stock s JOIN fruits f ON f.fruit_id = s.fruit_id`;

const shape = (r) => ({ ...r, is_low_stock: Boolean(r.is_low_stock) });

/** Stock for every fruit, split by packaging size. */
async function findAll() {
  return (await query(`${SELECT} ${ORDER}`)).map(shape);
}

/** Stock of one fruit: one entry per packaging size plus a convenience total. */
async function findByFruit(fruitId) {
  const rows = (await query(`${SELECT} WHERE s.fruit_id = ? ${ORDER}`, [fruitId])).map(shape);
  return rows;
}

/**
 * Low stock = at or below the row's own reorder_level, unless a ?threshold override is given.
 * Sorted by how empty the shelf is, so the most urgent item is first.
 */
async function findLow(threshold) {
  const useOverride = Number.isInteger(threshold);
  const sql = `${SELECT} WHERE s.available_quantity <= ${useOverride ? '?' : 's.reorder_level'}
               ORDER BY s.available_quantity ASC, f.fruit_name`;
  return (await query(sql, useOverride ? [threshold] : [])).map(shape);
}

async function setReorderLevel(fruitId, size, level) {
  const result = await query(
    'UPDATE stock SET reorder_level = ? WHERE fruit_id = ? AND packaging_size = ?',
    [level, fruitId, size]
  );
  return result.affectedRows > 0;
}

/** Ledger of every box that came in or went out (newest first). */
async function movements({ fruitId, size, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (fruitId) { where.push('m.fruit_id = ?'); params.push(fruitId); }
  if (size) { where.push('m.packaging_size = ?'); params.push(size); }
  params.push(limit);
  return query(
    `SELECT m.movement_id, m.fruit_id, f.fruit_name, m.packaging_size, m.change_quantity,
            m.reason, m.reference_id, m.created_at
     FROM stock_movements m JOIN fruits f ON f.fruit_id = m.fruit_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY m.movement_id DESC LIMIT ?`,
    params
  );
}

// ------------------------------------------------------------------
// Helpers used INSIDE transactions (they receive the transaction's connection)
// ------------------------------------------------------------------

/** Lock the stock rows we are about to change, always in the same order -> no deadlocks. */
async function lockRows(conn, pairs) {
  if (pairs.length === 0) return new Map();
  const [rows] = await conn.query(
    `SELECT fruit_id, packaging_size, available_quantity FROM stock
     WHERE (fruit_id, packaging_size) IN (?)
     ORDER BY fruit_id, packaging_size FOR UPDATE`,
    [pairs.map((p) => [p.fruit_id, p.packaging_size])]
  );
  return new Map(rows.map((r) => [`${r.fruit_id}:${r.packaging_size}`, r.available_quantity]));
}

/** Add boxes (purchase). Creates the stock row if this fruit+size has never been stocked. */
async function increase(conn, fruitId, size, quantity) {
  await conn.query(
    'INSERT IGNORE INTO stock (fruit_id, packaging_size, available_quantity) VALUES (?, ?, 0)',
    [fruitId, size]
  );
  await conn.query(
    'UPDATE stock SET available_quantity = available_quantity + ? WHERE fruit_id = ? AND packaging_size = ?',
    [quantity, fruitId, size]
  );
}

/**
 * Remove boxes (sale). The WHERE guard makes the decrement impossible when stock is short;
 * returns false in that case so the caller can abort and ROLLBACK.
 */
async function decrease(conn, fruitId, size, quantity) {
  const [result] = await conn.query(
    `UPDATE stock SET available_quantity = available_quantity - ?
     WHERE fruit_id = ? AND packaging_size = ? AND available_quantity >= ?`,
    [quantity, fruitId, size, quantity]
  );
  return result.affectedRows === 1;
}

async function logMovements(conn, rows) {
  if (rows.length === 0) return;
  await conn.query(
    'INSERT INTO stock_movements (fruit_id, packaging_size, change_quantity, reason, reference_id) VALUES ?',
    [rows.map((r) => [r.fruit_id, r.packaging_size, r.change_quantity, r.reason, r.reference_id])]
  );
}

module.exports = { findAll, findByFruit, findLow, setReorderLevel, movements, lockRows, increase, decrease, logMovements };
