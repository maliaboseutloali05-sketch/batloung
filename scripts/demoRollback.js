'use strict';
// Transaction demonstration for the video:  npm run demo:rollback
// A three-item sale where the LAST item cannot be fulfilled. The first two stock reductions have
// ALREADY happened inside the transaction when the failure occurs - ROLLBACK must undo them.
const { query, withTransaction, closePool } = require('../src/config/database');
const stockModel = require('../src/models/stockModel');

const WATCH = [[1, 'SMALL'], [2, 'MEDIUM'], [1, 'LARGE']];

async function snapshot(label) {
  const rows = await query(
    `SELECT f.fruit_name, s.packaging_size, s.available_quantity
     FROM stock s JOIN fruits f ON f.fruit_id = s.fruit_id
     WHERE (s.fruit_id, s.packaging_size) IN (?)
     ORDER BY s.fruit_id, FIELD(s.packaging_size, 'SMALL', 'MEDIUM', 'LARGE')`,
    [WATCH]
  );
  console.log(`\n${label}`);
  console.table(rows);
  return JSON.stringify(rows);
}

(async () => {
  try {
    const before = await snapshot('1) Stock BEFORE the sale');

    console.log('\n2) Starting transaction: sale of 5 small apples + 4 medium bananas + 500 large apples');
    try {
      await withTransaction(async (conn) => {
        for (const [fruit, size, qty] of [[1, 'SMALL', 5], [2, 'MEDIUM', 4], [1, 'LARGE', 500]]) {
          const ok = await stockModel.decrease(conn, fruit, size, qty);
          console.log(`   reduce fruit ${fruit} ${size} by ${qty}: ${ok ? 'done (not committed yet)' : 'REFUSED - not enough stock'}`);
          if (!ok) throw new Error(`Item failed validation: fruit ${fruit} ${size} x ${qty}`);
        }
      });
    } catch (err) {
      console.log(`   -> ${err.message}`);
      console.log('   -> withTransaction issued ROLLBACK');
    }

    const after = await snapshot('3) Stock AFTER the failed sale');
    console.log(before === after
      ? '\nPASS: stock is identical - the two successful reductions were rolled back.'
      : '\nFAIL: stock changed - the rollback did not work!');

    console.log('\n4) The database itself also refuses negative stock (CHECK constraint):');
    try {
      await query('UPDATE stock SET available_quantity = available_quantity - 100000 WHERE fruit_id = 1 AND packaging_size = ?', ['SMALL']);
      console.log('   unexpected: update succeeded');
    } catch (err) {
      console.log(`   MySQL error ${err.code}: ${err.sqlMessage}`);
    }
  } catch (err) {
    console.error('Demo could not run:', err.code || '', err.message);
    console.error('Is MySQL running and has "npm run db:setup" been executed?');
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
