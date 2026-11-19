'use strict';
const { query, run, withTransaction } = require('../config/database');
const stockModel = require('./stockModel');
const priceModel = require('./priceModel');
const { mergeItems } = require('../utils/items');
const { fromDb, toNumber, toMoneyString } = require('../utils/money');
const { paymentStatus } = require('../utils/payment');
const { badRequest, notFound, conflict } = require('../utils/httpError');

const shapeSale = (s) => ({
  sale_id: s.sale_id,
  vendor_id: s.vendor_id,
  vendor_name: s.vendor_name,
  sale_date: s.sale_date,
  payment_method: s.payment_method,
  payment_status: s.payment_status,
  total_amount: toNumber(fromDb(s.total_amount)),
  amount_paid: toNumber(fromDb(s.amount_paid)),
  balance_due: toNumber(fromDb(s.balance_due)),
});

async function findById(id, conn) {
  const heads = await run(
    conn,
    `SELECT s.sale_id, s.vendor_id, v.vendor_name, s.sale_date, s.payment_method, s.payment_status,
            s.total_amount, s.amount_paid, s.balance_due
     FROM sales s JOIN vendors v ON v.vendor_id = s.vendor_id WHERE s.sale_id = ?`,
    [id]
  );
  if (!heads[0]) return null;
  const items = await run(
    conn,
    `SELECT d.sales_detail_id, d.fruit_id, f.fruit_name, d.packaging_size, d.quantity, d.unit_price, d.line_total
     FROM sales_details d JOIN fruits f ON f.fruit_id = d.fruit_id
     WHERE d.sale_id = ?
     ORDER BY d.fruit_id, FIELD(d.packaging_size, 'SMALL', 'MEDIUM', 'LARGE')`,
    [id]
  );
  const payments = await run(
    conn,
    'SELECT payment_id, amount, method, reference, paid_at FROM payments WHERE sale_id = ? ORDER BY payment_id',
    [id]
  );
  return {
    ...shapeSale(heads[0]),
    items: items.map((d) => ({
      sales_detail_id: d.sales_detail_id,
      fruit_id: d.fruit_id,
      fruit_name: d.fruit_name,
      packaging_size: d.packaging_size,
      quantity: d.quantity,
      unit_price: toNumber(fromDb(d.unit_price)),
      line_total: toNumber(fromDb(d.line_total)),
    })),
    payments: payments.map((p) => ({ ...p, amount: toNumber(fromDb(p.amount)) })),
  };
}

async function findAll({ vendorId, status, from, to } = {}) {
  const where = [];
  const params = [];
  if (vendorId) { where.push('s.vendor_id = ?'); params.push(vendorId); }
  if (status) { where.push('s.payment_status = ?'); params.push(status); }
  if (from) { where.push('s.sale_date >= ?'); params.push(from); }
  if (to) { where.push('s.sale_date < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(to); }
  const rows = await query(
    `SELECT s.sale_id, s.vendor_id, v.vendor_name, s.sale_date, s.payment_method, s.payment_status,
            s.total_amount, s.amount_paid, s.balance_due
     FROM sales s JOIN vendors v ON v.vendor_id = s.vendor_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY s.sale_date DESC, s.sale_id DESC`,
    params
  );
  return rows.map(shapeSale);
}

/**
 * Record a sale atomically (the heart of the system).
 *
 *   BEGIN
 *     1. vendor exists?                         -> 404
 *     2. every fruit exists?                    -> 400
 *     3. every fruit+size has a selling price?  -> 400   (the SERVER prices the sale)
 *     4. lock the stock rows (SELECT ... FOR UPDATE, fixed order -> no deadlocks)
 *     5. is there enough of EVERY item?         -> 409 with a full shortage list, nothing written
 *     6. total = sum(quantity x unit price) in integer cents; validate the payment
 *     7. insert sale + lines, reduce stock (guarded), write ledger, record the payment
 *   COMMIT   - or ROLLBACK on any error: no partial sale, no lost stock
 */
async function create({ vendor_id, items, payment_method, amount_paid_cents, payment_reference }) {
  const lines = mergeItems(items);

  const saleId = await withTransaction(async (conn) => {
    // 1. vendor
    const vendor = await run(conn, 'SELECT vendor_id FROM vendors WHERE vendor_id = ?', [vendor_id]);
    if (vendor.length === 0) throw notFound(`Vendor ${vendor_id} is not registered`);

    // 2. fruits
    const fruitIds = [...new Set(lines.map((l) => l.fruit_id))];
    const fruits = await run(conn, 'SELECT fruit_id, fruit_name FROM fruits WHERE fruit_id IN (?)', [fruitIds]);
    const nameOf = new Map(fruits.map((f) => [f.fruit_id, f.fruit_name]));
    const unknown = lines.filter((l) => !nameOf.has(l.fruit_id));
    if (unknown.length) {
      throw badRequest('One or more fruits do not exist',
        unknown.map((l) => ({ fruit_id: l.fruit_id, message: `Fruit ${l.fruit_id} does not exist` })));
    }

    // 3. prices (set by the administrator in price_list, never typed during a sale)
    const prices = await priceModel.lookup(conn, lines);
    const unpriced = lines.filter((l) => !prices.has(`${l.fruit_id}:${l.packaging_size}`));
    if (unpriced.length) {
      throw badRequest('No selling price is set for some items',
        unpriced.map((l) => ({
          fruit_id: l.fruit_id, packaging_size: l.packaging_size,
          message: `${nameOf.get(l.fruit_id)} (${l.packaging_size}) has no price. Set it with PUT /api/prices`,
        })));
    }

    // 4 + 5. lock and verify stock for ALL lines before touching anything
    const available = await stockModel.lockRows(conn, lines);
    const shortages = lines
      .map((l) => ({
        fruit_id: l.fruit_id,
        fruit_name: nameOf.get(l.fruit_id),
        packaging_size: l.packaging_size,
        requested: l.quantity,
        available: available.get(`${l.fruit_id}:${l.packaging_size}`) || 0,
      }))
      .filter((s) => s.requested > s.available);
    if (shortages.length) {
      throw conflict(
        `Insufficient stock: ${shortages.map((s) => `${s.requested} ${s.packaging_size} ${s.fruit_name} requested, ${s.available} available`).join('; ')}. The whole sale was rejected and no stock was changed`,
        { shortages }
      );
    }

    // 6. totals + payment rules
    const priced = lines.map((l) => {
      const unit = prices.get(`${l.fruit_id}:${l.packaging_size}`);
      return { ...l, unit_price_cents: unit, line_total_cents: unit * l.quantity };
    });
    const totalCents = priced.reduce((sum, l) => sum + l.line_total_cents, 0);

    let paidCents = 0;
    if (payment_method !== 'CREDIT') paidCents = amount_paid_cents === undefined ? totalCents : amount_paid_cents;
    if (paidCents > totalCents) {
      throw badRequest(`amount_paid (${toMoneyString(paidCents)}) is more than the sale total (${toMoneyString(totalCents)})`);
    }
    const status = paymentStatus(totalCents, paidCents);

    // 7. write everything
    const [head] = await conn.query(
      `INSERT INTO sales (vendor_id, payment_method, payment_status, total_amount, amount_paid)
       VALUES (?, ?, ?, ?, ?)`,
      [vendor_id, payment_method, status, toMoneyString(totalCents), toMoneyString(paidCents)]
    );
    const id = head.insertId;

    await conn.query(
      'INSERT INTO sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price) VALUES ?',
      [priced.map((l) => [id, l.fruit_id, l.packaging_size, l.quantity, toMoneyString(l.unit_price_cents)])]
    );

    for (const l of priced) {
      const ok = await stockModel.decrease(conn, l.fruit_id, l.packaging_size, l.quantity);
      if (!ok) {
        // Cannot normally happen (rows are locked), but if it does the ROLLBACK undoes earlier lines.
        throw conflict(`Stock for ${nameOf.get(l.fruit_id)} (${l.packaging_size}) changed during the sale. Nothing was saved`);
      }
    }
    await stockModel.logMovements(
      conn,
      priced.map((l) => ({
        fruit_id: l.fruit_id, packaging_size: l.packaging_size,
        change_quantity: -l.quantity, reason: 'SALE', reference_id: id,
      }))
    );

    if (paidCents > 0) {
      await conn.query(
        'INSERT INTO payments (sale_id, amount, method, reference) VALUES (?, ?, ?, ?)',
        [id, toMoneyString(paidCents), payment_method, payment_reference]
      );
    }
    return id;
  });

  return findById(saleId);
}

/** A vendor pays off (part of) an existing balance later. */
async function addPayment(saleId, { amount_cents, method, reference }) {
  await withTransaction(async (conn) => {
    const rows = await run(
      conn,
      'SELECT sale_id, total_amount, amount_paid FROM sales WHERE sale_id = ? FOR UPDATE',
      [saleId]
    );
    if (rows.length === 0) throw notFound(`Sale ${saleId} does not exist`);

    const total = fromDb(rows[0].total_amount);
    const paid = fromDb(rows[0].amount_paid);
    const balance = total - paid;
    if (balance <= 0) throw conflict(`Sale ${saleId} is already fully paid`);
    if (amount_cents > balance) {
      throw badRequest(`Payment of ${toMoneyString(amount_cents)} is more than the outstanding balance of ${toMoneyString(balance)}`);
    }

    await conn.query(
      'INSERT INTO payments (sale_id, amount, method, reference) VALUES (?, ?, ?, ?)',
      [saleId, toMoneyString(amount_cents), method, reference]
    );
    const newPaid = paid + amount_cents;
    await conn.query(
      'UPDATE sales SET amount_paid = ?, payment_status = ? WHERE sale_id = ?',
      [toMoneyString(newPaid), paymentStatus(total, newPaid), saleId]
    );
  });
  return findById(saleId);
}

module.exports = { findById, findAll, create, addPayment };
