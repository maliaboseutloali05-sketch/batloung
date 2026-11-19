'use strict';
const { query } = require('../config/database');
const { buildUpdate, escapeLike } = require('../utils/sqlHelpers');

const COLUMNS = 'supplier_id, business_name, contact_person, phone, province, address, created_at';

async function create({ business_name, contact_person, phone, province, address }) {
  const result = await query(
    'INSERT INTO suppliers (business_name, contact_person, phone, province, address) VALUES (?, ?, ?, ?, ?)',
    [business_name, contact_person, phone, province, address]
  );
  return findById(result.insertId);
}

async function findAll({ province, search } = {}) {
  const where = [];
  const params = [];
  if (province) { where.push('province = ?'); params.push(province); }
  if (search) {
    where.push('(business_name LIKE ? OR contact_person LIKE ?)');
    const like = `%${escapeLike(search)}%`;
    params.push(like, like);
  }
  const sql = `SELECT ${COLUMNS} FROM suppliers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY business_name`;
  return query(sql, params);
}

async function findById(id) {
  const rows = await query(`SELECT ${COLUMNS} FROM suppliers WHERE supplier_id = ?`, [id]);
  return rows[0] || null;
}

async function update(id, data) {
  const built = buildUpdate('suppliers', 'supplier_id', id, data,
    ['business_name', 'contact_person', 'phone', 'province', 'address']);
  if (!built) return findById(id);
  await query(built.sql, built.params);
  return findById(id);
}

async function countPurchases(id) {
  const rows = await query('SELECT COUNT(*) AS n FROM purchases WHERE supplier_id = ?', [id]);
  return rows[0].n;
}

async function remove(id) {
  const result = await query('DELETE FROM suppliers WHERE supplier_id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { create, findAll, findById, update, countPurchases, remove };
