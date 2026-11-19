# Batloung Farm Distribution Management System

DIWA2110 Web Application Development: take-home test.
Node.js + Express REST API on MySQL, with a small admin dashboard.

Batloung Farm buys fruit from South African suppliers and sells it by the box (small, medium, large)
to street vendors in Lesotho. This system replaces the notebooks and spreadsheets and fixes each
problem named in the brief:

| Problem in the brief | How the system solves it |
|---|---|
| Can't track available stock | `stock` table has **one row per fruit and per packaging size**; `GET /api/stock` |
| Errors calculating orders and totals | The server prices every sale from the `price_list` table and adds it up in **integer cents**. Nobody types a total or a price |
| Vendors with outstanding payments | `sales.amount_paid` + `payments` table, `PAID / PARTIALLY_PAID / UNPAID`, `GET /api/vendors/balances` |
| Inconsistent supplier records | `UNIQUE` phone, `UNIQUE (business_name, province)`, province restricted to the 8 allowed values, phone and text validation |
| No accurate sales reports | `/api/reports/*` (the four required reports plus outstanding balances) |
| Can't see stock movement | `stock_movements` ledger: every box in and out is logged with the purchase or sale that caused it |

## Design decisions

1. **Three tables beyond the 8 required.** `price_list` (selling price per fruit and size), `payments` (each receipt
   against a sale) and `stock_movements` (audit ledger). The 8 required tables are exactly as specified in the brief.
2. **The server sets the price.** The brief says each size has a different price. `PUT /api/prices` refuses to give two
   sizes of one fruit the same price, and a sale cannot be recorded for an item that has no price.
3. **Money is never a float.** `DECIMAL(12,2)` in MySQL, integer cents in JavaScript (`src/utils/money.js`).
4. **Sales are all-or-nothing.** The sale transaction locks the stock rows (`SELECT ... FOR UPDATE`, always in the
   same order, so there are no deadlocks), checks **every** line, and only then writes. If anything is short, the
   response lists every shortage and nothing is saved. The `UPDATE ... WHERE available_quantity >= ?` guard and the
   `CHECK (available_quantity >= 0)` constraint are two further safety nets.
5. **The process never dies on a database problem.** Connection errors become `503` with a clear message, the server
   retries the connection in the background, and `/api/health` reports the state.

## Project structure

```
batloung-farm-dms/
|-- server.js                     start-up, background DB retry, graceful shutdown
|-- database/
|   |-- schema.sql                CREATE DATABASE + 11 tables + 2 views
|   |-- seed.sql                  realistic sample data (stock is derived from the history)
|   |-- reports.sql               the four required SQL reports (+ 2 bonus)
|   `-- transaction_demo.sql      BEGIN / COMMIT / ROLLBACK demonstration in plain SQL
|-- src/
|   |-- config/                   env.js (.env loading) and database.js (pool + transactions)
|   |-- routes/                   one router per resource
|   |-- controllers/              thin HTTP layer
|   |-- models/                   all SQL lives here (incl. the sale and purchase transactions)
|   |-- middleware/               validators, error handler, optional admin key, async wrapper, logger
|   `-- utils/                    money, payment status, item merging, SQL helpers, HttpError
|-- scripts/                      setupDatabase.js, demoRollback.js, demoApi.js
|-- tests/logic.test.js           22 database-free checks of the business logic
|-- public/index.html             admin dashboard (stock, balances, top fruits, record a sale)
`-- api-tests.http                every endpoint, ready to click in VS Code (REST Client)
```

## Run it locally

Requirements: Node.js 18+ and **MySQL 8.0.16+** (older versions ignore `CHECK` constraints).

```bash
npm install
cp .env.example .env        # then put your MySQL user and password in .env
npm run db:setup            # creates the database, tables and sample data
npm start                   # http://localhost:3000   (dashboard at "/")
```

Useful extras:

```bash
npm run test:logic          # business-logic checks (no database needed)
npm run demo:rollback       # transaction demo straight against MySQL
npm run demo:api            # end-to-end demo against the running server
```

## Environment variables

| Variable | Meaning |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection. **No password is stored in the code** |
| `DB_SSL` | `true` for hosts that require TLS |
| `ADMIN_API_KEY` | Optional. When set, every `/api` call needs the header `x-api-key` |

## Deploying for the "live link"

Any Node host plus a hosted MySQL works. One option is Railway (Node app and MySQL in one project):

1. Push the project to GitHub (`.env` is already git-ignored).
2. Create a Railway project, add a **MySQL** service, then add the repo as a service.
3. On the Node service set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` from the MySQL service's
   variables, and `DB_SSL` if the provider needs it. The start command is `npm start`.
4. Load the schema once from your laptop, with your `.env` pointing at the hosted database:
   `npm run db:setup:hosted` (it skips `CREATE DATABASE` because the host already created one).
5. Open `<your-url>/api/health`. It should say `connected`.

## Endpoints

All responses are JSON: `{ "success": true, "data": ... }` or `{ "success": false, "error": { "message", "details" } }`.

| Area | Method and path | Notes |
|---|---|---|
| Suppliers | `POST /api/suppliers` | 201 |
| | `GET /api/suppliers`, `GET /api/suppliers/:id` | filters `?province=`, `?search=` |
| | `PUT /api/suppliers/:id` | partial update allowed |
| | `DELETE /api/suppliers/:id` | **409 if the supplier has purchases** |
| Fruits | `POST /api/fruits` | also opens SMALL/MEDIUM/LARGE stock rows |
| | `GET /api/fruits`, `GET /api/fruits/:id`, `PUT /api/fruits/:id` | list defaults to ACTIVE, `?status=ALL` for everything |
| Prices | `GET /api/prices`, `PUT /api/prices` | one price per fruit and size, sizes must differ |
| Stock | `GET /api/stock` | every fruit and size |
| | `GET /api/stock/fruit/:fruitId` | one fruit, split by size, plus total |
| | `GET /api/stock/low[?threshold=n]` | at or below `reorder_level` (or the threshold you pass) |
| | `PUT /api/stock/fruit/:fruitId/:size/reorder-level` | per-size alert level |
| | `GET /api/stock/movements` | ledger, filters `fruit_id`, `size`, `limit` |
| Vendors | `POST /api/vendors`, `GET /api/vendors`, `PUT /api/vendors/:id`, `GET /api/vendors/:id` | |
| | `GET /api/vendors/search?q=` | partial name or phone |
| | `GET /api/vendors/balances[?owing=true]`, `GET /api/vendors/:id/balance` | outstanding balances |
| Purchases | `POST /api/purchases` | many items, server totals, stock goes up. `GET /api/purchases[/:id]` |
| Sales | `POST /api/sales` | many items, server prices and totals, checks and reduces stock |
| | `POST /api/sales/:id/payments` | pay off a balance later (CASH or MOBILE_MONEY) |
| | `GET /api/sales[/:id]` | filters `vendor_id`, `status`, `from`, `to` |
| Reports | `GET /api/reports/top-fruits` | five most frequently sold |
| | `GET /api/reports/revenue?from=&to=` | revenue billed and collected in a date range |
| | `GET /api/reports/top-vendor` | vendor with the most boxes (ties included) |
| | `GET /api/reports/stock-levels` | stock per fruit and size |
| | `GET /api/reports/outstanding-balances` | who owes what |

**Status codes:** `200` OK, `201` created, `400` invalid input, `401` bad admin key, `404` record or route not found,
`409` conflict (insufficient stock, duplicate record, delete blocked), `500` unexpected error,
`503` database unavailable.

### Sale request example

```json
POST /api/sales
{
  "vendor_id": 2,
  "payment_method": "MOBILE_MONEY",
  "amount_paid": 300,
  "payment_reference": "MM-55120044",
  "items": [
    { "fruit_id": 1, "packaging_size": "LARGE", "quantity": 4 },
    { "fruit_id": 5, "packaging_size": "SMALL", "quantity": 2 }
  ]
}
```

`payment_method` is `CASH`, `MOBILE_MONEY` or `CREDIT`. Leaving `amount_paid` out means "pay in full".
A `CREDIT` sale starts `UNPAID`. Anything between zero and the total gives `PARTIALLY_PAID`.

### The "10 large boxes but only 6 available" case

```json
HTTP 409
{
  "success": false,
  "error": {
    "message": "Insufficient stock: 10 LARGE Apples requested, 6 available. The whole sale was rejected and no stock was changed",
    "details": { "shortages": [ { "fruit_name": "Apples", "packaging_size": "LARGE", "requested": 10, "available": 6 } ] }
  }
}
```

No `sales` row is created and no stock changes, even for the valid lines in the same request.

## Marking-rubric map

| Rubric area | Where to look |
|---|---|
| Database creation, tables, keys, constraints, sample data, size-specific stock | `database/schema.sql`, `database/seed.sql` |
| Project init and structure, `.env`, async/await and try/catch | `package.json`, `src/`, `.env.example`, `src/middleware/asyncHandler.js` |
| Reliable connection that doesn't crash | `src/config/database.js`, `server.js`, `src/middleware/errorHandler.js` |
| Supplier, fruit and stock, vendor, purchase, sales APIs | `src/routes/*`, `src/controllers/*`, `src/models/*` |
| Validation and status codes | `src/middleware/validators.js`, `src/middleware/errorHandler.js` |
| Sales calculations, stock logic | `src/models/salesModel.js`, `src/models/stockModel.js`, `src/utils/money.js` |
| SQL reports | `database/reports.sql`, `src/models/reportModel.js` |
| Transactions with COMMIT / ROLLBACK | `withTransaction` in `src/config/database.js`, `database/transaction_demo.sql`, `scripts/demoRollback.js` |
| Payments and outstanding balances | `salesModel.addPayment`, `vendorModel.balances`, `vw_vendor_balances` |

## Suggested order for the demo video

1. `/api/health` and the dashboard, then `GET /api/stock` (point out small, medium and large rows).
2. `POST /api/purchases` with three items, then `GET /api/stock` to show the quantities rose.
3. `POST /api/sales` (valid, credit): show the server-calculated total and the `UNPAID` status.
4. The failing sale from `api-tests.http`, then `GET /api/stock` again to show it did not change.
5. `POST /api/sales/:id/payments`, then `GET /api/vendors/balances`.
6. The four reports, `npm run demo:rollback`, and a quick look at the folder structure on GitHub.
