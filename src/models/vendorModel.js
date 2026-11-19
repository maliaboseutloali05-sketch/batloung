'use strict';
const { query } = require('../config/database');
const { buildUpdate, escapeLike } = require('../utils/sqlHelpers');
const { fromDb, toNumber } = require('../utils/money');

const COLUMNS = 'vendor_id, vendor_name, phone_number, location, registration_date';

async function create({ vendor_name, phone_number, location, registration_date }) {
  const result = registration_date
    ? await query('INSERT INTO vendors (vendor_name, phone_number, location, registration_date) VALUES (?, ?, ?, ?)',
      [vendor_name, phone_number, location, registration_date])
    : await query('INSERT INTO vendors (vendor_name, phone_number, location) VALUES (?, ?, ?)',
      [vendor_name, phone_number, location]);
  return findById(result.insertId);
}

async function findAll() {
  return query(`SELECT ${COLUMNS} FROM vendors ORDER BY vendor_name`);
}

async function findById(id) {
  const rows = await query(`SELECT ${COLUMNS} FROM vendors WHERE vendor_id = ?`, [id]);
  return rows[0] || null;
}

/** Matches part of the name OR part of the phone number (spaces / + ignored in the phone). */
async function search(text) {
  const nameLike = `%${escapeLike(text)}%`;
  const digits = text.replace(/[^\d]/g, '');
  const phoneLike = digits.length >= 3 ? `%${escapeLike(digits)}%` : null;
  const sql = `SELECT ${COLUMNS} FROM vendors
               WHERE vendor_name LIKE ?
                  ${phoneLike ? "OR REPLACE(REPLACE(phone_number, '+', ''), ' ', '') LIKE ?" : ''}
               ORDER BY vendor_name`;
  return query(sql, phoneLike ? [nameLike, phoneLike] : [nameLike]);
}

async function update(id, data) {
  const built = buildUpdate('vendors', 'vendor_id', id, data,
    ['vendor_name', 'phone_number', 'location', 'registration_date']);
  if (!built) return findById(id);
  await query(built.sql, built.params);
  return findById(id);
}

function shapeBalance(row) {
  return {
    vendor_id: row.vendor_id,
    vendor_name: row.vendor_name,
    phone_number: row.phone_number,
    total_sales: Number(row.total_sales),
    total_billed: toNumber(fromDb(row.total_billed)),
    total_paid: toNumber(fromDb(row.total_paid)),
    outstanding_balance: toNumber(fromDb(row.outstanding_balance)),
  };
}

/** Every vendor with what they were billed, what they paid and what they still owe. */
async function balances({ onlyOwing = false } = {}) {
  const rows = await query(
    `SELECT * FROM vw_vendor_balances ${onlyOwing ? 'WHERE outstanding_balance > 0' : ''}
     ORDER BY outstanding_balance DESC, vendor_name`
  );
  return rows.map(shapeBalance);
}

/** One vendor's balance plus the individual sales that are still open. */
async function balanceFor(id) {
  const rows = await query('SELECT * FROM vw_vendor_balances WHERE vendor_id = ?', [id]);
  if (!rows[0]) return null;
  const openSales = await query(
    `SELECT sale_id, sale_date, payment_method, payment_status, total_amount, amount_paid, balance_due
     FROM sales WHERE vendor_id = ? AND balance_due > 0 ORDER BY sale_date`,
    [id]
  );
  return {
    ...shapeBalance(rows[0]),
    open_sales: openSales.map((s) => ({
      sale_id: s.sale_id,
      sale_date: s.sale_date,
      payment_method: s.payment_method,
      payment_status: s.payment_status,
      total_amount: toNumber(fromDb(s.total_amount)),
      amount_paid: toNumber(fromDb(s.amount_paid)),
      balance_due: toNumber(fromDb(s.balance_due)),
    })),
  };
}

module.exports = { create, findAll, findById, search, update, balances, balanceFor };
