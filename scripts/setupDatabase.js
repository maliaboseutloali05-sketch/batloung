'use strict';
// Creates the database, tables and sample data from database/schema.sql + database/seed.sql
//   npm run db:setup                -> creates the database too (local MySQL)
//   npm run db:setup:hosted         -> database already exists on the host (Railway, Aiven, ...)
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config/env');

const skipCreate = process.argv.includes('--skip-db-create');
const withoutSeed = process.argv.includes('--no-seed');

function prepare(sqlText) {
  let sql = sqlText.replace(/batloung_farm_dms/g, config.db.database);
  if (skipCreate) {
    // the hosting provider already made the database: drop CREATE DATABASE / USE lines
    sql = sql.replace(/^\s*CREATE DATABASE[\s\S]*?;\s*$/gim, '').replace(/^\s*USE\s+\S+;\s*$/gim, '');
  }
  return sql;
}

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: skipCreate ? config.db.database : undefined,
      multipleStatements: true,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
    });
    console.log(`Connected to MySQL at ${config.db.host}:${config.db.port}`);

    const dir = path.join(__dirname, '..', 'database');
    console.log('Creating schema ...');
    await conn.query(prepare(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8')));

    if (!withoutSeed) {
      console.log('Inserting sample data ...');
      await conn.query(prepare(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8')));
    }

    const [[counts]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM suppliers) AS suppliers, (SELECT COUNT(*) FROM fruits) AS fruits,
              (SELECT COUNT(*) FROM vendors) AS vendors, (SELECT COUNT(*) FROM purchases) AS purchases,
              (SELECT COUNT(*) FROM sales) AS sales, (SELECT COUNT(*) FROM stock) AS stock_rows`
    );
    console.log('Done. Row counts:', counts);
  } catch (err) {
    console.error('Setup failed:', err.code || '', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('Check DB_USER / DB_PASSWORD in your .env file.');
    if (err.code === 'ECONNREFUSED') console.error('MySQL is not running or DB_HOST / DB_PORT is wrong.');
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
