-- =====================================================================
--  Batloung Farm Distribution Management System
--  MySQL 8.0.16+ schema (CHECK constraints are enforced from 8.0.16)
--
--  Core tables required by the brief (8):
--    suppliers, fruits, vendors, purchases, purchase_details,
--    sales, sales_details, stock
--  Supporting tables added to solve the business problems in the brief (3):
--    price_list       -> one selling price per fruit + packaging size
--    payments         -> every cash / mobile-money receipt against a sale
--    stock_movements  -> audit ledger of every box in and out
--
--  Money is stored as DECIMAL(12,2) in Maloti (LSL). Never FLOAT.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS batloung_farm_dms
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE batloung_farm_dms;

-- Drop in child-first order so the script can be re-run safely.
SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW  IF EXISTS vw_stock_levels;
DROP VIEW  IF EXISTS vw_vendor_balances;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS sales_details;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS purchase_details;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS price_list;
DROP TABLE IF EXISTS stock;
DROP TABLE IF EXISTS vendors;
DROP TABLE IF EXISTS fruits;
DROP TABLE IF EXISTS suppliers;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. suppliers : South African farms / agents we buy from
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  supplier_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_name   VARCHAR(120) NOT NULL,
  contact_person  VARCHAR(100) NOT NULL,
  phone           VARCHAR(20)  NOT NULL,
  province        ENUM('Gauteng','Free State','KwaZulu-Natal','Western Cape',
                       'Eastern Cape','Limpopo','Mpumalanga','North West') NOT NULL,
  address         VARCHAR(255) NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (supplier_id),
  -- "Inconsistent supplier records" -> the same business cannot be captured twice
  UNIQUE KEY uq_supplier_phone (phone),
  UNIQUE KEY uq_supplier_name_province (business_name, province),
  CONSTRAINT chk_supplier_phone_len CHECK (CHAR_LENGTH(phone) BETWEEN 7 AND 20),
  CONSTRAINT chk_supplier_name_len  CHECK (CHAR_LENGTH(TRIM(business_name)) >= 2)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. fruits
-- ---------------------------------------------------------------------
CREATE TABLE fruits (
  fruit_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fruit_name   VARCHAR(60)  NOT NULL,
  description  VARCHAR(255) NULL,
  status       ENUM('ACTIVE','DISCONTINUED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (fruit_id),
  UNIQUE KEY uq_fruit_name (fruit_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. vendors : street vendors and small retailers in Lesotho
-- ---------------------------------------------------------------------
CREATE TABLE vendors (
  vendor_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_name        VARCHAR(120) NOT NULL,
  phone_number       VARCHAR(20)  NOT NULL,
  location           VARCHAR(150) NOT NULL,
  registration_date  DATE         NOT NULL DEFAULT (CURRENT_DATE),
  PRIMARY KEY (vendor_id),
  UNIQUE KEY uq_vendor_phone (phone_number),
  KEY idx_vendor_name (vendor_name),
  CONSTRAINT chk_vendor_phone_len CHECK (CHAR_LENGTH(phone_number) BETWEEN 7 AND 20)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. stock : ONE ROW PER FRUIT *AND* PACKAGING SIZE
--    (small / medium / large are never merged into one total)
-- ---------------------------------------------------------------------
CREATE TABLE stock (
  stock_id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fruit_id            INT UNSIGNED NOT NULL,
  packaging_size      ENUM('SMALL','MEDIUM','LARGE') NOT NULL,
  available_quantity  INT NOT NULL DEFAULT 0,
  reorder_level       INT NOT NULL DEFAULT 20,
  PRIMARY KEY (stock_id),
  UNIQUE KEY uq_stock_fruit_size (fruit_id, packaging_size),
  CONSTRAINT fk_stock_fruit FOREIGN KEY (fruit_id) REFERENCES fruits (fruit_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  -- Last line of defence: the database itself refuses negative stock.
  CONSTRAINT chk_stock_not_negative CHECK (available_quantity >= 0),
  CONSTRAINT chk_stock_reorder      CHECK (reorder_level >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. price_list : the selling price per box, per fruit, per size
--    The API reads prices from here, so the admin never types a price
--    during a sale and cannot make arithmetic mistakes.
-- ---------------------------------------------------------------------
CREATE TABLE price_list (
  price_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fruit_id        INT UNSIGNED NOT NULL,
  packaging_size  ENUM('SMALL','MEDIUM','LARGE') NOT NULL,
  unit_price      DECIMAL(10,2) NOT NULL,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (price_id),
  UNIQUE KEY uq_price_fruit_size (fruit_id, packaging_size),
  CONSTRAINT fk_price_fruit FOREIGN KEY (fruit_id) REFERENCES fruits (fruit_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_price_positive CHECK (unit_price > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. purchases + 7. purchase_details : stock coming IN
-- ---------------------------------------------------------------------
CREATE TABLE purchases (
  purchase_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id    INT UNSIGNED NOT NULL,
  purchase_date  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (purchase_id),
  KEY idx_purchase_date (purchase_date),
  CONSTRAINT fk_purchase_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (supplier_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,           -- supplier with history cannot be deleted
  CONSTRAINT chk_purchase_total CHECK (total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE purchase_details (
  purchase_detail_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_id         INT UNSIGNED NOT NULL,
  fruit_id            INT UNSIGNED NOT NULL,
  packaging_size      ENUM('SMALL','MEDIUM','LARGE') NOT NULL,
  quantity            INT NOT NULL,
  unit_cost           DECIMAL(10,2) NOT NULL,
  line_total          DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  PRIMARY KEY (purchase_detail_id),
  UNIQUE KEY uq_purchase_line (purchase_id, fruit_id, packaging_size),
  CONSTRAINT fk_pd_purchase FOREIGN KEY (purchase_id) REFERENCES purchases (purchase_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_pd_fruit FOREIGN KEY (fruit_id) REFERENCES fruits (fruit_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_pd_quantity  CHECK (quantity > 0),
  CONSTRAINT chk_pd_unit_cost CHECK (unit_cost >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 8. sales + 9. sales_details : stock going OUT to vendors
--    amount_paid is kept in step with the payments table inside the same
--    transaction, so "who owes us money" is one cheap column lookup.
-- ---------------------------------------------------------------------
CREATE TABLE sales (
  sale_id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_id       INT UNSIGNED NOT NULL,
  sale_date       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_method  ENUM('CASH','MOBILE_MONEY','CREDIT') NOT NULL DEFAULT 'CASH',
  payment_status  ENUM('PAID','PARTIALLY_PAID','UNPAID') NOT NULL DEFAULT 'UNPAID',
  total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  amount_paid     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_due     DECIMAL(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  PRIMARY KEY (sale_id),
  KEY idx_sale_date   (sale_date),
  KEY idx_sale_vendor (vendor_id, payment_status),
  CONSTRAINT fk_sale_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (vendor_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_sale_total   CHECK (total_amount >= 0),
  CONSTRAINT chk_sale_paid    CHECK (amount_paid >= 0 AND amount_paid <= total_amount)
) ENGINE=InnoDB;

CREATE TABLE sales_details (
  sales_detail_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id          INT UNSIGNED NOT NULL,
  fruit_id         INT UNSIGNED NOT NULL,
  packaging_size   ENUM('SMALL','MEDIUM','LARGE') NOT NULL,
  quantity         INT NOT NULL,
  unit_price       DECIMAL(10,2) NOT NULL,
  line_total       DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  PRIMARY KEY (sales_detail_id),
  UNIQUE KEY uq_sale_line (sale_id, fruit_id, packaging_size),
  KEY idx_sd_fruit (fruit_id),
  CONSTRAINT fk_sd_sale FOREIGN KEY (sale_id) REFERENCES sales (sale_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_sd_fruit FOREIGN KEY (fruit_id) REFERENCES fruits (fruit_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_sd_quantity   CHECK (quantity > 0),
  CONSTRAINT chk_sd_unit_price CHECK (unit_price > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 10. payments : each receipt of money against a sale
-- ---------------------------------------------------------------------
CREATE TABLE payments (
  payment_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id     INT UNSIGNED NOT NULL,
  amount      DECIMAL(12,2) NOT NULL,
  method      ENUM('CASH','MOBILE_MONEY') NOT NULL,
  reference   VARCHAR(60) NULL,                      -- e.g. M-Pesa / EcoCash transaction code
  paid_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  KEY idx_payment_sale (sale_id),
  CONSTRAINT fk_payment_sale FOREIGN KEY (sale_id) REFERENCES sales (sale_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 11. stock_movements : append-only ledger (answers "where did the boxes go?")
--     change_quantity is + for purchases and - for sales.
-- ---------------------------------------------------------------------
CREATE TABLE stock_movements (
  movement_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fruit_id         INT UNSIGNED NOT NULL,
  packaging_size   ENUM('SMALL','MEDIUM','LARGE') NOT NULL,
  change_quantity  INT NOT NULL,
  reason           ENUM('PURCHASE','SALE') NOT NULL,
  reference_id     INT UNSIGNED NOT NULL,            -- purchase_id or sale_id
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (movement_id),
  KEY idx_mv_fruit_size (fruit_id, packaging_size, created_at),
  CONSTRAINT fk_mv_fruit FOREIGN KEY (fruit_id) REFERENCES fruits (fruit_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_mv_nonzero CHECK (change_quantity <> 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Views used by the reports
-- ---------------------------------------------------------------------
CREATE VIEW vw_stock_levels AS
SELECT f.fruit_id,
       f.fruit_name,
       s.packaging_size,
       s.available_quantity,
       s.reorder_level,
       (s.available_quantity <= s.reorder_level) AS is_low_stock
FROM stock s
JOIN fruits f ON f.fruit_id = s.fruit_id;

CREATE VIEW vw_vendor_balances AS
SELECT v.vendor_id,
       v.vendor_name,
       v.phone_number,
       COUNT(s.sale_id)                      AS total_sales,
       COALESCE(SUM(s.total_amount), 0)      AS total_billed,
       COALESCE(SUM(s.amount_paid), 0)       AS total_paid,
       COALESCE(SUM(s.balance_due), 0)       AS outstanding_balance
FROM vendors v
LEFT JOIN sales s ON s.vendor_id = v.vendor_id
GROUP BY v.vendor_id, v.vendor_name, v.phone_number;
