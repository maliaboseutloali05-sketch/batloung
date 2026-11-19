-- =====================================================================
--  Part D : transaction demonstration in plain SQL
--  Scenario: a vendor orders THREE items; the third is impossible.
--  Expected result: stock is exactly as it was before the script ran.
--  Run in the MySQL client / Workbench, one block at a time, for the video.
-- =====================================================================
USE batloung_farm_dms;

-- Step 0: stock BEFORE
SELECT fruit_id, packaging_size, available_quantity
FROM stock WHERE (fruit_id, packaging_size) IN ((1,'SMALL'), (2,'MEDIUM'), (1,'LARGE'))
ORDER BY fruit_id, packaging_size;

-- ---------------------------------------------------------------------
-- A) FAILING sale: item 3 asks for 500 large apples but only ~50 exist.
--    (If your SQL client stops at the error, simply run the ROLLBACK line yourself.)
-- ---------------------------------------------------------------------
BEGIN;

INSERT INTO sales (vendor_id, payment_method, payment_status, total_amount, amount_paid)
VALUES (6, 'CREDIT', 'UNPAID', 0, 0);
SET @sale_id = LAST_INSERT_ID();

-- item 1 : 5 small apples  -> succeeds
INSERT INTO sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price) VALUES (@sale_id, 1, 'SMALL', 5, 120.00);
UPDATE stock SET available_quantity = available_quantity - 5 WHERE fruit_id = 1 AND packaging_size = 'SMALL';

-- item 2 : 4 medium bananas -> succeeds
INSERT INTO sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price) VALUES (@sale_id, 2, 'MEDIUM', 4, 140.00);
UPDATE stock SET available_quantity = available_quantity - 4 WHERE fruit_id = 2 AND packaging_size = 'MEDIUM';

-- item 3 : 500 large apples -> the CHECK (available_quantity >= 0) rejects this
--          with error 3819 "Check constraint 'chk_stock_not_negative' is violated"
INSERT INTO sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price) VALUES (@sale_id, 1, 'LARGE', 500, 280.00);
UPDATE stock SET available_quantity = available_quantity - 500 WHERE fruit_id = 1 AND packaging_size = 'LARGE';

-- Because item 3 failed we undo EVERYTHING: the sale header, both details, both stock reductions.
ROLLBACK;

-- Step 1: stock AFTER the rollback must be identical to Step 0, and no sale row remains
SELECT fruit_id, packaging_size, available_quantity
FROM stock WHERE (fruit_id, packaging_size) IN ((1,'SMALL'), (2,'MEDIUM'), (1,'LARGE'))
ORDER BY fruit_id, packaging_size;
SELECT COUNT(*) AS orphan_sales_rows FROM sales WHERE sale_id = @sale_id;   -- 0

-- ---------------------------------------------------------------------
-- B) SUCCESSFUL sale: the same pattern with valid quantities -> COMMIT
-- ---------------------------------------------------------------------
BEGIN;

INSERT INTO sales (vendor_id, payment_method, payment_status, total_amount, amount_paid)
VALUES (6, 'CASH', 'PAID', 0, 0);
SET @sale_id = LAST_INSERT_ID();

INSERT INTO sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price) VALUES (@sale_id, 1, 'SMALL', 5, 120.00);
UPDATE stock SET available_quantity = available_quantity - 5 WHERE fruit_id = 1 AND packaging_size = 'SMALL';

INSERT INTO sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price) VALUES (@sale_id, 2, 'MEDIUM', 4, 140.00);
UPDATE stock SET available_quantity = available_quantity - 4 WHERE fruit_id = 2 AND packaging_size = 'MEDIUM';

UPDATE sales
SET total_amount = (SELECT SUM(line_total) FROM sales_details WHERE sale_id = @sale_id)
WHERE sale_id = @sale_id;
UPDATE sales SET amount_paid = total_amount WHERE sale_id = @sale_id;
INSERT INTO payments (sale_id, amount, method) SELECT sale_id, total_amount, 'CASH' FROM sales WHERE sale_id = @sale_id;

COMMIT;

SELECT * FROM sales WHERE sale_id = @sale_id;
