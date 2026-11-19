'use strict';
const { query, withTransaction } = require('../config/database');
const { fromDb, toNumber, toMoneyString } = require('../utils/money');
const { badRequest, notFound } = require('../utils/httpError');

const SIZE_ORDER = "FIELD(p.packaging_size, 'SMALL', 'MEDIUM', 'LARGE')";

async function findAll() {
  const rows = await query(
    `SELECT p.price_id, f.fruit_id, f.fruit_name, p.packaging_size, p.unit_price, p.updated_at
     FROM price_list p JOIN fruits f ON f.fruit_id = p.fruit_id
     ORDER BY f.fruit_name, ${SIZE_ORDER}`
  );
  return rows.map((r) => ({ ...r, unit_price: toNumber(fromDb(r.unit_price)) }));
}

/**
 * Create or change one selling price. Business rule from the brief: the three packaging sizes of a
 * fruit must NEVER share the same price, so the rule is checked inside the same transaction.
 */
async function upsert({ fruit_id, packaging_size, unit_price_cents }) {
  return withTransaction(async (conn) => {
    const [fruit] = await conn.query('SELECT fruit_id FROM fruits WHERE fruit_id = ?', [fruit_id]);
    if (fruit.length === 0) throw notFound(`Fruit ${fruit_id} does not exist`);

    const [others] = await conn.query(
      'SELECT packaging_size, unit_price FROM price_list WHERE fruit_id = ? AND packaging_size <> ? FOR UPDATE',
      [fruit_id, packaging_size]
    );
    const clash = others.find((o) => fromDb(o.unit_price) === unit_price_cents);
    if (clash) {
      throw badRequest(
        `The ${clash.packaging_size} size of this fruit already sells at ${toMoneyString(unit_price_cents)}. Each packaging size must have a different price`
      );
    }

    await conn.query(
      `INSERT INTO price_list (fruit_id, packaging_size, unit_price) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE unit_price = VALUES(unit_price)`,
      [fruit_id, packaging_size, toMoneyString(unit_price_cents)]
    );
    const [rows] = await conn.query(
      `SELECT p.price_id, f.fruit_id, f.fruit_name, p.packaging_size, p.unit_price, p.updated_at
       FROM price_list p JOIN fruits f ON f.fruit_id = p.fruit_id
       WHERE p.fruit_id = ? AND p.packaging_size = ?`,
      [fruit_id, packaging_size]
    );
    return { ...rows[0], unit_price: toNumber(fromDb(rows[0].unit_price)) };
  });
}

/** Used inside the sales transaction: Map "fruitId:SIZE" -> price in cents. */
async function lookup(conn, pairs) {
  if (pairs.length === 0) return new Map();
  const [rows] = await conn.query(
    'SELECT fruit_id, packaging_size, unit_price FROM price_list WHERE (fruit_id, packaging_size) IN (?)',
    [pairs.map((p) => [p.fruit_id, p.packaging_size])]
  );
  return new Map(rows.map((r) => [`${r.fruit_id}:${r.packaging_size}`, fromDb(r.unit_price)]));
}

module.exports = { findAll, upsert, lookup };
