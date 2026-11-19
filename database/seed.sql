-- =====================================================================
--  Sample data for Batloung Farm DMS  (run AFTER schema.sql)
--  Stock is DERIVED from the seeded purchases minus the seeded sales, so
--  the numbers always reconcile with the ledger.
-- =====================================================================
USE batloung_farm_dms;

-- ---------------- suppliers (one per province we buy from) -----------
INSERT INTO suppliers (business_name, contact_person, phone, province, address) VALUES
('Highveld Fresh Produce',      'Johan van Wyk',      '+27115550101', 'Gauteng',        '14 Market Road, City Deep, Johannesburg'),
('Vrystaat Orchards',           'Anneke Botha',       '+27515550102', 'Free State',     'Plot 7, R26 Road, Ficksburg'),
('Zulu Coast Tropicals',        'Sipho Ndlovu',       '+27315550103', 'KwaZulu-Natal',  '22 Harbour Lane, Durban North'),
('Cape Winelands Grapes',       'Marlene Pietersen',  '+27215550104', 'Western Cape',   'Farm 12, Hexrivier Valley, Worcester'),
('Albany Citrus Co-op',         'Thandeka Mbeki',     '+27465550105', 'Eastern Cape',   'Co-op Building, Kirkwood'),
('Letaba Mango Growers',        'Tshepo Mashaba',     '+27155550106', 'Limpopo',        'Letsitele Road, Tzaneen'),
('Lowveld Fruit Exchange',      'Lindiwe Dlamini',    '+27135550107', 'Mpumalanga',     '5 Station Street, Nelspruit'),
('Bokone Banana Farm',          'Kabelo Molefe',      '+27185550108', 'North West',     'Farm 3, Brits Road, Rustenburg');

-- ---------------- fruits ---------------------------------------------
INSERT INTO fruits (fruit_name, description, status) VALUES
('Apples',  'Crisp eating apples, mixed red varieties',        'ACTIVE'),
('Bananas', 'Cavendish bananas, packed green-yellow',          'ACTIVE'),
('Oranges', 'Valencia oranges, juicing and eating',            'ACTIVE'),
('Mangoes', 'Kent and Tommy Atkins mangoes (seasonal)',        'ACTIVE'),
('Grapes',  'Seedless table grapes, white and red',            'ACTIVE');

-- ---------------- vendors --------------------------------------------
INSERT INTO vendors (vendor_name, phone_number, location, registration_date) VALUES
('Mpho Khasu',          '+26658123401', 'Thetsane, Maseru',          '2026-01-12'),
('Lineo Mokoena',       '+26658123402', 'Maseru Bus Rank, Maseru',   '2026-01-20'),
('Thabo Letsie',        '+26658123403', 'Teyateyaneng Market',       '2026-02-03'),
('Palesa Nthane',       '+26658123404', 'Hlotse, Leribe',            '2026-02-17'),
('Tumelo Mofokeng',     '+26658123405', 'Mafeteng Main Street',      '2026-03-09'),
('Mamello Ramokoena',   '+26658123406', 'Roma Village Stall',        '2026-04-01'),
('Retselisitsoe Molapo','+26658123407', 'Mohale''s Hoek Taxi Rank',  '2026-05-15'),
('Nthabiseng Tau',      '+26658123408', 'Maputsoe Border Market',    '2026-06-22');

-- ---------------- selling prices (every size has a DIFFERENT price) ---
INSERT INTO price_list (fruit_id, packaging_size, unit_price) VALUES
(1,'SMALL',120.00),(1,'MEDIUM',190.00),(1,'LARGE',280.00),
(2,'SMALL', 90.00),(2,'MEDIUM',140.00),(2,'LARGE',210.00),
(3,'SMALL',100.00),(3,'MEDIUM',160.00),(3,'LARGE',240.00),
(4,'SMALL',150.00),(4,'MEDIUM',230.00),(4,'LARGE',340.00),
(5,'SMALL',180.00),(5,'MEDIUM',275.00),(5,'LARGE',400.00);

-- ---------------- purchases ------------------------------------------
INSERT INTO purchases (supplier_id, purchase_date, total_amount) VALUES
(1, '2026-10-12 09:30:00', 0),   -- P1 Gauteng: apples + bananas
(2, '2026-10-15 10:15:00', 0),   -- P2 Free State: oranges + grapes
(4, '2026-10-28 08:45:00', 0),   -- P3 Western Cape: apples L, mangoes
(3, '2026-11-08 11:00:00', 0);   -- P4 KwaZulu-Natal: bananas + oranges

INSERT INTO purchase_details (purchase_id, fruit_id, packaging_size, quantity, unit_cost) VALUES
(1,1,'SMALL',60,80.00),(1,1,'MEDIUM',50,130.00),(1,1,'LARGE',40,190.00),
(1,2,'SMALL',70,60.00),(1,2,'MEDIUM',60,95.00), (1,2,'LARGE',40,140.00),
(2,3,'SMALL',80,68.00),(2,3,'MEDIUM',60,108.00),(2,3,'LARGE',50,165.00),
(2,5,'SMALL',40,120.00),(2,5,'MEDIUM',30,185.00),(2,5,'LARGE',25,270.00),
(3,1,'LARGE',30,192.00),
(3,4,'SMALL',50,100.00),(3,4,'MEDIUM',40,155.00),(3,4,'LARGE',30,230.00),
(4,2,'MEDIUM',40,96.00),(4,2,'LARGE',30,142.00),(4,3,'MEDIUM',40,110.00);

UPDATE purchases p
SET p.total_amount = (SELECT SUM(d.line_total) FROM purchase_details d WHERE d.purchase_id = p.purchase_id);

-- ---------------- sales ----------------------------------------------
INSERT INTO sales (vendor_id, sale_date, payment_method) VALUES
(1, '2026-10-20 14:10:00', 'CASH'),          -- S1 paid in full, cash
(2, '2026-10-24 09:20:00', 'CREDIT'),        -- S2 on credit, later part-paid
(3, '2026-10-30 12:40:00', 'MOBILE_MONEY'),  -- S3 part-paid by mobile money
(1, '2026-11-05 15:05:00', 'CASH'),          -- S4 paid in full, cash
(4, '2026-11-10 10:30:00', 'CREDIT'),        -- S5 on credit, nothing paid yet
(5, '2026-11-13 16:00:00', 'MOBILE_MONEY');  -- S6 paid in full, mobile money

INSERT INTO sales_details (sale_id, fruit_id, packaging_size, quantity, unit_price) VALUES
(1,1,'SMALL',20,120.00),(1,1,'MEDIUM',15,190.00),(1,2,'SMALL',25,90.00),
(2,3,'MEDIUM',20,160.00),(2,3,'LARGE',15,240.00),(2,4,'SMALL',10,150.00),
(3,5,'MEDIUM',10,275.00),(3,1,'LARGE',12,280.00),(3,2,'LARGE',10,210.00),
(4,2,'MEDIUM',30,140.00),(4,4,'MEDIUM',15,230.00),
(5,5,'SMALL',15,180.00),(5,3,'SMALL',30,100.00),(5,1,'LARGE',8,280.00),
(6,4,'LARGE',12,340.00),(6,1,'SMALL',10,120.00);

UPDATE sales s
SET s.total_amount = (SELECT SUM(d.line_total) FROM sales_details d WHERE d.sale_id = s.sale_id);

-- ---------------- payments -------------------------------------------
INSERT INTO payments (sale_id, amount, method, reference, paid_at) VALUES
(1, 7500.00, 'CASH',         NULL,          '2026-10-20 14:12:00'),
(2, 2000.00, 'CASH',         NULL,          '2026-11-02 09:00:00'),
(3, 5000.00, 'MOBILE_MONEY', 'MM-88213907', '2026-10-30 12:45:00'),
(4, 7650.00, 'CASH',         NULL,          '2026-11-05 15:06:00'),
(6, 5280.00, 'MOBILE_MONEY', 'MM-88455120', '2026-11-13 16:02:00');

UPDATE sales s
SET s.amount_paid = COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id = s.sale_id), 0);

UPDATE sales
SET payment_status = CASE
      WHEN amount_paid = 0              THEN 'UNPAID'
      WHEN amount_paid < total_amount   THEN 'PARTIALLY_PAID'
      ELSE 'PAID'
    END;

-- ---------------- stock = purchases - sales, for every fruit x size ---
INSERT INTO stock (fruit_id, packaging_size, available_quantity, reorder_level)
SELECT f.fruit_id,
       z.sz,
       COALESCE((SELECT SUM(pd.quantity) FROM purchase_details pd
                  WHERE pd.fruit_id = f.fruit_id AND pd.packaging_size = z.sz), 0)
     - COALESCE((SELECT SUM(sd.quantity) FROM sales_details sd
                  WHERE sd.fruit_id = f.fruit_id AND sd.packaging_size = z.sz), 0),
       CASE z.sz WHEN 'SMALL' THEN 30 WHEN 'MEDIUM' THEN 25 ELSE 20 END
FROM fruits f
CROSS JOIN (SELECT 'SMALL' AS sz UNION ALL SELECT 'MEDIUM' UNION ALL SELECT 'LARGE') z;

-- ---------------- movement ledger rebuilt from the same history --------
INSERT INTO stock_movements (fruit_id, packaging_size, change_quantity, reason, reference_id, created_at)
SELECT pd.fruit_id, pd.packaging_size, pd.quantity, 'PURCHASE', pd.purchase_id, p.purchase_date
FROM purchase_details pd JOIN purchases p ON p.purchase_id = pd.purchase_id;

INSERT INTO stock_movements (fruit_id, packaging_size, change_quantity, reason, reference_id, created_at)
SELECT sd.fruit_id, sd.packaging_size, -sd.quantity, 'SALE', sd.sale_id, s.sale_date
FROM sales_details sd JOIN sales s ON s.sale_id = sd.sale_id;
