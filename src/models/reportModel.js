'use strict';
// The four SQL reports required by Part D (identical to database/reports.sql) plus one bonus.
const { query } = require('../config/database');
const { fromDb, toNumber } = require('../utils/money');

/** 1. Five most frequently sold fruits (boxes, all packaging sizes combined). */
async function topFruits(limit = 5) {
  const rows = await query(
    `SELECT f.fruit_id, f.fruit_name,
            SUM(sd.quantity)   AS boxes_sold,
            SUM(sd.line_total) AS revenue
     FROM sales_details sd
     JOIN fruits f ON f.fruit_id = sd.fruit_id
     GROUP BY f.fruit_id, f.fruit_name
     ORDER BY boxes_sold DESC, f.fruit_name ASC
     LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    fruit_id: r.fruit_id,
    fruit_name: r.fruit_name,
    boxes_sold: Number(r.boxes_sold),
    revenue: toNumber(fromDb(r.revenue)),
  }));
}

/** 2. Sales revenue between two dates, both days included. */
async function revenueBetween(from, to) {
  const rows = await query(
    `SELECT COUNT(*)                       AS number_of_sales,
            COALESCE(SUM(total_amount), 0) AS revenue_billed,
            COALESCE(SUM(amount_paid), 0)  AS revenue_collected
     FROM sales
     WHERE sale_date >= ? AND sale_date < DATE_ADD(?, INTERVAL 1 DAY)`,
    [from, to]
  );
  const r = rows[0];
  const billed = fromDb(r.revenue_billed);
  const collected = fromDb(r.revenue_collected);
  return {
    from,
    to,
    number_of_sales: Number(r.number_of_sales),
    revenue_billed: toNumber(billed),
    revenue_collected: toNumber(collected),
    still_owed: toNumber(billed - collected),
  };
}

/** 3. Vendor(s) with the highest number of boxes bought (ties are all returned). */
async function topVendors() {
  const rows = await query(
    `SELECT v.vendor_id, v.vendor_name, v.phone_number, SUM(sd.quantity) AS total_boxes
     FROM vendors v
     JOIN sales s          ON s.vendor_id = v.vendor_id
     JOIN sales_details sd ON sd.sale_id  = s.sale_id
     GROUP BY v.vendor_id, v.vendor_name, v.phone_number
     HAVING total_boxes = (
       SELECT MAX(t.boxes)
       FROM (SELECT SUM(sd2.quantity) AS boxes
             FROM sales s2
             JOIN sales_details sd2 ON sd2.sale_id = s2.sale_id
             GROUP BY s2.vendor_id) t
     )
     ORDER BY v.vendor_name`
  );
  return rows.map((r) => ({ ...r, total_boxes: Number(r.total_boxes) }));
}

/** 4. Current stock for each fruit and packaging size. */
async function stockLevels() {
  const rows = await query(
    `SELECT f.fruit_name, s.packaging_size, s.available_quantity, s.reorder_level,
            IF(s.available_quantity <= s.reorder_level, 'LOW', 'OK') AS level
     FROM stock s JOIN fruits f ON f.fruit_id = s.fruit_id
     ORDER BY f.fruit_name, FIELD(s.packaging_size, 'SMALL', 'MEDIUM', 'LARGE')`
  );
  return rows;
}

module.exports = { topFruits, revenueBetween, topVendors, stockLevels };
