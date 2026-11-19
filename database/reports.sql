-- =====================================================================
--  Part D : SQL reporting queries (the API runs these same statements)
--  Replace the date literals in query 2 as needed.
-- =====================================================================
USE batloung_farm_dms;

-- 1. Five most frequently sold fruits (by boxes, all sizes combined)
SELECT f.fruit_id,
       f.fruit_name,
       SUM(sd.quantity)   AS boxes_sold,
       SUM(sd.line_total) AS revenue
FROM sales_details sd
JOIN fruits f ON f.fruit_id = sd.fruit_id
GROUP BY f.fruit_id, f.fruit_name
ORDER BY boxes_sold DESC, f.fruit_name ASC
LIMIT 5;

-- 2. Total sales revenue in a date range (both ends inclusive)
SELECT COUNT(*)                         AS number_of_sales,
       COALESCE(SUM(total_amount), 0)   AS revenue_billed,
       COALESCE(SUM(amount_paid), 0)    AS revenue_collected
FROM sales
WHERE sale_date >= '2026-10-01'
  AND sale_date <  DATE_ADD('2026-10-31', INTERVAL 1 DAY);

-- 3. Vendor(s) who bought the highest number of boxes (ties are all returned)
SELECT v.vendor_id,
       v.vendor_name,
       SUM(sd.quantity) AS total_boxes
FROM vendors v
JOIN sales s          ON s.vendor_id = v.vendor_id
JOIN sales_details sd ON sd.sale_id  = s.sale_id
GROUP BY v.vendor_id, v.vendor_name
HAVING total_boxes = (
        SELECT MAX(t.boxes)
        FROM (SELECT SUM(sd2.quantity) AS boxes
              FROM sales s2
              JOIN sales_details sd2 ON sd2.sale_id = s2.sale_id
              GROUP BY s2.vendor_id) t
);

-- 4. Current stock for each fruit and packaging size
SELECT f.fruit_name,
       s.packaging_size,
       s.available_quantity,
       s.reorder_level,
       IF(s.available_quantity <= s.reorder_level, 'LOW', 'OK') AS level
FROM stock s
JOIN fruits f ON f.fruit_id = s.fruit_id
ORDER BY f.fruit_name, FIELD(s.packaging_size, 'SMALL', 'MEDIUM', 'LARGE');

-- Bonus: vendors who still owe us money
SELECT vendor_id, vendor_name, total_billed, total_paid, outstanding_balance
FROM vw_vendor_balances
WHERE outstanding_balance > 0
ORDER BY outstanding_balance DESC;

-- Bonus: audit check - ledger must equal the stock table for every row
SELECT s.fruit_id, s.packaging_size, s.available_quantity AS in_stock_table,
       COALESCE(SUM(m.change_quantity), 0) AS in_ledger
FROM stock s
LEFT JOIN stock_movements m ON m.fruit_id = s.fruit_id AND m.packaging_size = s.packaging_size
GROUP BY s.fruit_id, s.packaging_size, s.available_quantity
HAVING in_stock_table <> in_ledger;   -- expect ZERO rows
