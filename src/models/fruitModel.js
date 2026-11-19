'use strict';
const { query, withTransaction } = require('../config/database');
const { buildUpdate } = require('../utils/sqlHelpers');

const SIZES = ['SMALL', 'MEDIUM', 'LARGE'];

async function findAll(status = 'ACTIVE') {
  if (status === 'ALL') return query('SELECT fruit_id, fruit_name, description, status FROM fruits ORDER BY fruit_name');
  return query('SELECT fruit_id, fruit_name, description, status FROM fruits WHERE status = ? ORDER BY fruit_name', [status]);
}

async function findById(id) {
  const rows = await query('SELECT fruit_id, fruit_name, description, status FROM fruits WHERE fruit_id = ?', [id]);
  return rows[0] || null;
}

/** Creating a fruit also opens its three (empty) packaging-size stock rows in the same transaction. */
async function create({ fruit_name, description, status }) {
  const fruitId = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO fruits (fruit_name, description, status) VALUES (?, ?, ?)',
      [fruit_name, description || null, status || 'ACTIVE']
    );
    await conn.query(
      'INSERT INTO stock (fruit_id, packaging_size, available_quantity) VALUES ?',
      [SIZES.map((size) => [result.insertId, size, 0])]
    );
    return result.insertId;
  });
  return findById(fruitId);
}

async function update(id, data) {
  const built = buildUpdate('fruits', 'fruit_id', id, data, ['fruit_name', 'description', 'status']);
  if (!built) return findById(id);
  await query(built.sql, built.params);
  return findById(id);
}

module.exports = { findAll, findById, create, update };
