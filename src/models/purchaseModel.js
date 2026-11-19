'use strict';
const { query, run, withTransaction } = require('../config/database');
const stockModel = require('./stockModel');
const { mergeItems } = require('../utils/items');
const { fromDb, toNumber, toMoneyString } = require('../utils/money');
const { badRequest, notFound } = require('../utils/httpError');

const shapeItem = (d) => ({
  purchase_detail_id: d.purchase_detail_id,
  fruit_id: d.fruit_id,
  fruit_name: d.fruit_name,
  packaging_size: d.packaging_size,
  quantity: d.quantity,
  unit_cost: toNumber(fromDb(d.unit_cost)),
  line_total: toNumber(fromDb(d.line_total)),
});

async function findById(id, conn) {
  const heads = await run(
    conn,
    `SELECT p.purchase_id, p.supplier_id, s.business_name AS supplier_name, s.province,
            p.purchase_date, p.total_amount
     FROM purchases p JOIN suppliers s ON s.supplier_id = p.supplier_id
     WHERE p.purchase_id = ?`,
    [id]
  );
  if (!heads[0]) return null;
  const items = await run(
    conn,
    `SELECT d.purchase_detail_id, d.fruit_id, f.fruit_name, d.packaging_size, d.quantity, d.unit_cost, d.line_total
     FROM purchase_details d JOIN fruits f ON f.fruit_id = d.fruit_id
     WHERE d.purchase_id = ?
     ORDER BY d.fruit_id, FIELD(d.packaging_size, 'SMALL', 'MEDIUM', 'LARGE')`,
    [id]
  );
  return { ...heads[0], total_amount: toNumber(fromDb(heads[0].total_amount)), items: items.map(shapeItem) };
}

async function findAll({ supplierId } = {}) {
  const rows = await query(
    `SELECT p.purchase_id, p.supplier_id, s.business_name AS supplier_name, p.purchase_date, p.total_amount,
            (SELECT COALESCE(SUM(quantity), 0) FROM purchase_details d WHERE d.purchase_id = p.purchase_id) AS total_boxes
     FROM purchases p JOIN suppliers s ON s.supplier_id = p.supplier_id
     ${supplierId ? 'WHERE p.supplier_id = ?' : ''}
     ORDER BY p.purchase_date DESC, p.purchase_id DESC`,
    supplierId ? [supplierId] : []
  );
  return rows.map((r) => ({ ...r, total_boxes: Number(r.total_boxes), total_amount: toNumber(fromDb(r.total_amount)) }));
}

/**
 * Record a purchase atomically:
 *   BEGIN
 *     check supplier + fruits -> insert header -> insert lines -> total -> add stock -> ledger
 *   COMMIT          (or ROLLBACK if ANY step throws - nothing is half-saved)
 */
async function create({ supplier_id, items }) {
  const lines = mergeItems(items);

  const purchaseId = await withTransaction(async (conn) => {
    const supplier = await run(conn, 'SELECT supplier_id FROM suppliers WHERE supplier_id = ?', [supplier_id]);
    if (supplier.length === 0) throw notFound(`Supplier ${supplier_id} does not exist`);

    // every fruit must exist and be ACTIVE (we do not buy discontinued products)
    const fruitIds = [...new Set(lines.map((l) => l.fruit_id))];
    const fruits = await run(conn, 'SELECT fruit_id, fruit_name, status FROM fruits WHERE fruit_id IN (?)', [fruitIds]);
    const byId = new Map(fruits.map((f) => [f.fruit_id, f]));
    const problems = [];
    lines.forEach((l) => {
      const f = byId.get(l.fruit_id);
      if (!f) problems.push({ fruit_id: l.fruit_id, message: `Fruit ${l.fruit_id} does not exist` });
      else if (f.status !== 'ACTIVE') problems.push({ fruit_id: l.fruit_id, message: `${f.fruit_name} is DISCONTINUED and cannot be purchased` });
    });
    if (problems.length) throw badRequest('One or more purchase items are invalid', problems);

    // the server calculates the total - the client never sends one
    const totalCents = lines.reduce((sum, l) => sum + l.quantity * l.unit_cost_cents, 0);

    const [head] = await conn.query('INSERT INTO purchases (supplier_id, total_amount) VALUES (?, ?)', [
      supplier_id,
      toMoneyString(totalCents),
    ]);
    const id = head.insertId;

    await conn.query(
      'INSERT INTO purchase_details (purchase_id, fruit_id, packaging_size, quantity, unit_cost) VALUES ?',
      [lines.map((l) => [id, l.fruit_id, l.packaging_size, l.quantity, toMoneyString(l.unit_cost_cents)])]
    );

    // stock goes UP, separately for each fruit + packaging size
    for (const l of lines) {
      await stockModel.increase(conn, l.fruit_id, l.packaging_size, l.quantity);
    }
    await stockModel.logMovements(
      conn,
      lines.map((l) => ({
        fruit_id: l.fruit_id, packaging_size: l.packaging_size,
        change_quantity: l.quantity, reason: 'PURCHASE', reference_id: id,
      }))
    );
    return id;
  });

  return findById(purchaseId);
}

module.exports = { findById, findAll, create };
