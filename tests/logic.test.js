'use strict';
// Dependency-free checks of the pure business logic:  npm run test:logic
// (no database needed - money maths, payment status, item merging, validation, error mapping)
const assert = require('assert');
const { parseMoney, fromDb, toMoneyString, toNumber } = require('../src/utils/money');
const { paymentStatus } = require('../src/utils/payment');
const { mergeItems } = require('../src/utils/items');
const { buildUpdate, escapeLike } = require('../src/utils/sqlHelpers');
const { toHttpError } = require('../src/middleware/errorHandler');
const v = require('../src/middleware/validators');
const { HttpError } = require('../src/utils/httpError');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

/** Run an Express-style validator and return { error, body }. */
function run(mw, { body, params, query } = {}) {
  const req = { body, params: params || {}, query: query || {} };
  let error;
  mw(req, {}, (e) => { error = e; });
  return { error, body: req.body, req };
}

console.log('money');
test('parseMoney accepts 2-decimal amounts', () => {
  assert.strictEqual(parseMoney('120'), 12000);
  assert.strictEqual(parseMoney(120.5), 12050);
  assert.strictEqual(parseMoney('0.07'), 7);
});
test('parseMoney rejects bad input', () => {
  ['abc', '-5', '1.234', '', null, undefined, '1e3'].forEach((x) => assert.strictEqual(parseMoney(x), null, String(x)));
});
test('cents round-trip without float drift', () => {
  assert.strictEqual(toMoneyString(30), '0.30');
  assert.strictEqual(toMoneyString(7500 * 100), '7500.00');
  assert.strictEqual(parseMoney('0.1') + parseMoney('0.2'), parseMoney('0.3')); // 10 + 20 === 30, no float drift
  assert.strictEqual(toMoneyString(5), '0.05');
  assert.strictEqual(fromDb('7650.00'), 765000);
  assert.strictEqual(toNumber(1999), 19.99);
});
test('sale total for several fruits and sizes is exact', () => {
  const prices = { 'A-S': parseMoney('120.00'), 'A-M': parseMoney('190.00'), 'B-S': parseMoney('90.00') };
  const total = 20 * prices['A-S'] + 15 * prices['A-M'] + 25 * prices['B-S'];
  assert.strictEqual(toMoneyString(total), '7500.00'); // matches seeded sale #1
});

console.log('payment status');
test('PAID / PARTIALLY_PAID / UNPAID', () => {
  assert.strictEqual(paymentStatus(10000, 0), 'UNPAID');
  assert.strictEqual(paymentStatus(10000, 4000), 'PARTIALLY_PAID');
  assert.strictEqual(paymentStatus(10000, 10000), 'PAID');
});

console.log('item merging');
test('duplicate fruit+size lines are summed and sorted', () => {
  const merged = mergeItems([
    { fruit_id: 2, packaging_size: 'LARGE', quantity: 1 },
    { fruit_id: 1, packaging_size: 'SMALL', quantity: 5 },
    { fruit_id: 1, packaging_size: 'SMALL', quantity: 7 },
  ]);
  assert.deepStrictEqual(merged.map((m) => [m.fruit_id, m.packaging_size, m.quantity]), [[1, 'SMALL', 12], [2, 'LARGE', 1]]);
});
test('same line with different unit costs is rejected', () => {
  assert.throws(() => mergeItems([
    { fruit_id: 1, packaging_size: 'SMALL', quantity: 5, unit_cost_cents: 8000 },
    { fruit_id: 1, packaging_size: 'SMALL', quantity: 5, unit_cost_cents: 9000 },
  ]), HttpError);
});

console.log('sql helpers');
test('buildUpdate only writes whitelisted columns', () => {
  const b = buildUpdate('vendors', 'vendor_id', 3, { vendor_name: 'X', hacked: 'y', location: undefined }, ['vendor_name', 'location']);
  assert.strictEqual(b.sql, 'UPDATE vendors SET vendor_name = ? WHERE vendor_id = ?');
  assert.deepStrictEqual(b.params, ['X', 3]);
  assert.strictEqual(buildUpdate('vendors', 'vendor_id', 3, {}, ['vendor_name']), null);
});
test('escapeLike neutralises wildcards', () => assert.strictEqual(escapeLike('50%_off'), '50\\%\\_off'));

console.log('validators');
test('supplier: valid body is cleaned (phone, province case)', () => {
  const r = run(v.supplier(), { body: {
    business_name: '  Cape   Grapes ', contact_person: 'Ann Smith', phone: '+27 21 555 0100',
    province: 'western cape', address: '12 Farm Road' } });
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.body.phone, '+27215550100');
  assert.strictEqual(r.body.province, 'Western Cape');
  assert.strictEqual(r.body.business_name, 'Cape Grapes');
});
test('supplier: collects every problem, status 400', () => {
  const r = run(v.supplier(), { body: { phone: '12', province: 'Narnia' } });
  assert.strictEqual(r.error.status, 400);
  const fields = r.error.details.map((d) => d.field);
  ['business_name', 'contact_person', 'phone', 'address', 'province'].forEach((f) => assert.ok(fields.includes(f), f));
});
test('supplier partial update needs at least one field', () => {
  assert.strictEqual(run(v.supplier({ partial: true }), { body: {} }).error.status, 400);
  assert.strictEqual(run(v.supplier({ partial: true }), { body: { address: '99 New Street' } }).error, undefined);
});
test('purchase: items validated and costs converted to cents', () => {
  const ok = run(v.purchase, { body: { supplier_id: 1, items: [{ fruit_id: 1, packaging_size: 'small', quantity: 10, unit_cost: '80.50' }] } });
  assert.strictEqual(ok.error, undefined);
  assert.deepStrictEqual(ok.body.items[0], { fruit_id: 1, packaging_size: 'SMALL', quantity: 10, unit_cost_cents: 8050 });
  const bad = run(v.purchase, { body: { supplier_id: 1, items: [{ fruit_id: 1, packaging_size: 'HUGE', quantity: 0, unit_cost: -1 }] } });
  assert.strictEqual(bad.error.details.length, 3);
});
test('purchase: empty items array rejected', () => {
  assert.strictEqual(run(v.purchase, { body: { supplier_id: 1, items: [] } }).error.status, 400);
});
test('sale: defaults to CASH, paid in full (amount_paid undefined)', () => {
  const r = run(v.sale, { body: { vendor_id: 2, items: [{ fruit_id: 1, packaging_size: 'LARGE', quantity: 10 }] } });
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.body.payment_method, 'CASH');
  assert.strictEqual(r.body.amount_paid_cents, undefined);
});
test('sale: credit with a deposit, and cash with 0, are both rejected', () => {
  const items = [{ fruit_id: 1, packaging_size: 'LARGE', quantity: 1 }];
  assert.strictEqual(run(v.sale, { body: { vendor_id: 1, items, payment_method: 'CREDIT', amount_paid: 50 } }).error.status, 400);
  assert.strictEqual(run(v.sale, { body: { vendor_id: 1, items, payment_method: 'CASH', amount_paid: 0 } }).error.status, 400);
});
test('sale: partial mobile-money payment accepted', () => {
  const r = run(v.sale, { body: { vendor_id: 1, items: [{ fruit_id: 1, packaging_size: 'LARGE', quantity: 1 }],
    payment_method: 'mobile_money', amount_paid: '100.00', payment_reference: 'MM-1' } });
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.body.amount_paid_cents, 10000);
  assert.strictEqual(r.body.payment_method, 'MOBILE_MONEY');
});
test('payment: method CREDIT is not a receipt', () => {
  assert.strictEqual(run(v.salePayment, { body: { amount: 10, method: 'CREDIT' } }).error.status, 400);
  assert.strictEqual(run(v.salePayment, { body: { amount: 10, method: 'cash' } }).error, undefined);
});
test('id param must be a positive integer', () => {
  assert.strictEqual(run(v.idParam(), { params: { id: 'abc' } }).error.status, 400);
  assert.strictEqual(run(v.idParam(), { params: { id: '0' } }).error.status, 400);
  const ok = run(v.idParam(), { params: { id: '7' } });
  assert.strictEqual(ok.error, undefined);
  assert.strictEqual(ok.req.params.id, 7);
});
test('date range: real dates, ordered, required', () => {
  const mw = v.dateRange({ required: true });
  assert.strictEqual(run(mw, { query: {} }).error.status, 400);
  assert.strictEqual(run(mw, { query: { from: '2026-02-30', to: '2026-03-01' } }).error.status, 400);
  assert.strictEqual(run(mw, { query: { from: '2026-11-10', to: '2026-11-01' } }).error.status, 400);
  assert.strictEqual(run(mw, { query: { from: '2026-10-01', to: '2026-10-31' } }).error, undefined);
});
test('vendor search needs 2+ characters', () => {
  assert.strictEqual(run(v.vendorSearch, { query: { q: 'a' } }).error.status, 400);
  assert.strictEqual(run(v.vendorSearch, { query: { q: ' mpho ' } }).error, undefined);
});

console.log('error mapping');
test('MySQL errors become the right HTTP status', () => {
  assert.strictEqual(toHttpError({ code: 'ER_DUP_ENTRY', sqlMessage: 'x' }).status, 409);
  assert.strictEqual(toHttpError({ code: 'ER_ROW_IS_REFERENCED_2' }).status, 409);
  assert.strictEqual(toHttpError({ code: 'ER_CHECK_CONSTRAINT_VIOLATED', sqlMessage: 'x' }).status, 400);
  assert.strictEqual(toHttpError({ code: 'ECONNREFUSED' }).status, 503);
  assert.strictEqual(toHttpError({ code: 'ER_ACCESS_DENIED_ERROR' }).status, 503);
  assert.strictEqual(toHttpError({ type: 'entity.parse.failed' }).status, 400);
  assert.strictEqual(toHttpError(new Error('boom')).status, 500);
});

console.log(`\n${passed} checks passed${process.exitCode ? ' - WITH FAILURES' : ''}`);
