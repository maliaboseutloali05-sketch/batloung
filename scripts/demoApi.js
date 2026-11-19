'use strict';
// End-to-end demo against a RUNNING server:   npm run demo:api   (BASE_URL=https://your-live-link to test production)
const config = require('../src/config/env');

const BASE = (process.env.BASE_URL || `http://localhost:${config.port}`).replace(/\/$/, '');
const headers = { 'Content-Type': 'application/json' };
if (config.adminApiKey) headers['x-api-key'] = config.adminApiKey;

async function call(method, url, body) {
  const res = await fetch(`${BASE}${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const stockOf = async () => JSON.stringify((await call('GET', '/api/stock')).json.data.map((r) => [r.fruit_id, r.packaging_size, r.available_quantity]));

(async () => {
  console.log(`Target: ${BASE}\n`);

  const before = await stockOf();

  console.log('A) Sale with two valid items and one impossible item (100000 LARGE apples) - must be rejected as a whole');
  const bad = await call('POST', '/api/sales', {
    vendor_id: 1,
    payment_method: 'CASH',
    items: [
      { fruit_id: 2, packaging_size: 'SMALL', quantity: 1 },
      { fruit_id: 1, packaging_size: 'MEDIUM', quantity: 1 },
      { fruit_id: 1, packaging_size: 'LARGE', quantity: 100000 },
    ],
  });
  console.log(`   HTTP ${bad.status} -> ${bad.json.error ? bad.json.error.message : JSON.stringify(bad.json)}`);

  const after = await stockOf();
  console.log(before === after ? '   PASS: stock unchanged, no partial sale created\n' : '   FAIL: stock changed!\n');

  console.log('B) Valid credit sale (server prices it):');
  const ok = await call('POST', '/api/sales', {
    vendor_id: 2,
    payment_method: 'CREDIT',
    items: [
      { fruit_id: 3, packaging_size: 'SMALL', quantity: 2 },
      { fruit_id: 5, packaging_size: 'LARGE', quantity: 1 },
    ],
  });
  console.log(`   HTTP ${ok.status}`, ok.json.data
    ? { sale_id: ok.json.data.sale_id, total: ok.json.data.total_amount, status: ok.json.data.payment_status, balance: ok.json.data.balance_due }
    : ok.json);

  if (ok.json.data) {
    console.log('\nC) Vendor pays part of it later (mobile money):');
    const pay = await call('POST', `/api/sales/${ok.json.data.sale_id}/payments`, {
      amount: 200, method: 'MOBILE_MONEY', reference: 'MM-DEMO-001',
    });
    console.log(`   HTTP ${pay.status}`, pay.json.data
      ? { status: pay.json.data.payment_status, paid: pay.json.data.amount_paid, balance: pay.json.data.balance_due }
      : pay.json);

    console.log('\nD) Overpayment is refused:');
    const over = await call('POST', `/api/sales/${ok.json.data.sale_id}/payments`, { amount: 999999, method: 'CASH' });
    console.log(`   HTTP ${over.status} -> ${over.json.error && over.json.error.message}`);
  }

  console.log('\nE) Reports:');
  const top = await call('GET', '/api/reports/top-fruits');
  console.log('   top fruits:', top.json.data);
  const owing = await call('GET', '/api/reports/outstanding-balances');
  console.log('   vendors owing:', owing.json.data && owing.json.data.map((v) => `${v.vendor_name}: ${v.outstanding_balance}`));
})().catch((err) => {
  console.error('Could not reach the API:', err.message, '- is the server running?');
  process.exitCode = 1;
});
