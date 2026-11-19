'use strict';
// Request validation. Each validator checks req.body / req.params / req.query, collects ALL problems
// (not just the first) and answers 400 with a field-by-field list. On success the cleaned values
// replace req.body so controllers can trust their input.
const { badRequest } = require('../utils/httpError');
const { parseMoney } = require('../utils/money');
const { PAYMENT_METHODS, RECEIPT_METHODS } = require('../utils/payment');

const PROVINCES = [
  'Gauteng', 'Free State', 'KwaZulu-Natal', 'Western Cape',
  'Eastern Cape', 'Limpopo', 'Mpumalanga', 'North West',
];
const SIZES = ['SMALL', 'MEDIUM', 'LARGE'];
const FRUIT_STATUSES = ['ACTIVE', 'DISCONTINUED'];
const MAX_ITEMS = 50;
const MAX_QTY = 100000;

// ----------------------------------------------------------------- helpers
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function fail(errors) {
  return badRequest('Validation failed', errors);
}

function readText(src, field, errors, { required = true, min = 1, max = 255, label = field } = {}) {
  const raw = src[field];
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (required) errors.push({ field, message: `${label} is required` });
    return undefined;
  }
  if (typeof raw !== 'string') {
    errors.push({ field, message: `${label} must be text` });
    return undefined;
  }
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < min || value.length > max) {
    errors.push({ field, message: `${label} must be between ${min} and ${max} characters` });
    return undefined;
  }
  return value;
}

function readPhone(src, field, errors, { required = true } = {}) {
  const raw = src[field];
  if (raw === undefined || raw === null || raw === '') {
    if (required) errors.push({ field, message: 'Phone number is required' });
    return undefined;
  }
  const cleaned = String(raw).replace(/[\s\-().]/g, '');
  if (!/^\+?\d{7,15}$/.test(cleaned)) {
    errors.push({ field, message: 'Phone number must contain 7 to 15 digits (optionally starting with +)' });
    return undefined;
  }
  return cleaned;
}

function readPositiveInt(value, max = 2147483647) {
  const n = typeof value === 'string' && /^\d+$/.test(value.trim()) ? parseInt(value, 10) : value;
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

function readSize(value) {
  const up = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return SIZES.includes(up) ? up : null;
}

function requireBodyObject(req) {
  if (!isObject(req.body)) throw fail([{ field: 'body', message: 'A JSON object body is required' }]);
}

function onlyIfAnyField(data, errors) {
  if (Object.values(data).every((v) => v === undefined) && errors.length === 0) {
    errors.push({ field: 'body', message: 'Provide at least one field to update' });
  }
}

/** Shared by purchase & sale: validate the items[] array. `withCost` adds unit_cost. */
function readItems(body, errors, { withCost }) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push({ field: 'items', message: 'items must be a non-empty array' });
    return [];
  }
  if (body.items.length > MAX_ITEMS) {
    errors.push({ field: 'items', message: `A single transaction can hold at most ${MAX_ITEMS} items` });
    return [];
  }
  const cleaned = [];
  body.items.forEach((item, i) => {
    const at = `items[${i}]`;
    if (!isObject(item)) {
      errors.push({ field: at, message: 'Each item must be an object' });
      return;
    }
    const fruitId = readPositiveInt(item.fruit_id);
    if (fruitId === null) errors.push({ field: `${at}.fruit_id`, message: 'fruit_id must be a positive whole number' });

    const size = readSize(item.packaging_size);
    if (size === null) errors.push({ field: `${at}.packaging_size`, message: 'packaging_size must be SMALL, MEDIUM or LARGE' });

    const qty = readPositiveInt(item.quantity, MAX_QTY);
    if (qty === null) errors.push({ field: `${at}.quantity`, message: `quantity must be a whole number from 1 to ${MAX_QTY}` });

    const out = { fruit_id: fruitId, packaging_size: size, quantity: qty };
    if (withCost) {
      const cents = parseMoney(item.unit_cost);
      if (cents === null || cents <= 0) {
        errors.push({ field: `${at}.unit_cost`, message: 'unit_cost must be a positive amount with at most 2 decimals' });
      }
      out.unit_cost_cents = cents;
    }
    cleaned.push(out);
  });
  return cleaned;
}

// ----------------------------------------------------------------- route params / query
function idParam(name = 'id') {
  return (req, res, next) => {
    const id = readPositiveInt(req.params[name]);
    if (id === null) return next(badRequest(`${name} must be a positive whole number`));
    req.params[name] = id;
    return next();
  };
}

function sizeParam(name = 'size') {
  return (req, res, next) => {
    const size = readSize(req.params[name]);
    if (size === null) return next(badRequest('packaging size must be SMALL, MEDIUM or LARGE'));
    req.params[name] = size;
    return next();
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(text) {
  if (!DATE_RE.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD  (both required when `required` is true) */
function dateRange({ required = false } = {}) {
  return (req, res, next) => {
    const errors = [];
    const { from, to } = req.query;
    if (required && !from) errors.push({ field: 'from', message: 'from is required (YYYY-MM-DD)' });
    if (required && !to) errors.push({ field: 'to', message: 'to is required (YYYY-MM-DD)' });
    if (from && !isRealDate(from)) errors.push({ field: 'from', message: 'from must be a real date in YYYY-MM-DD format' });
    if (to && !isRealDate(to)) errors.push({ field: 'to', message: 'to must be a real date in YYYY-MM-DD format' });
    if (errors.length === 0 && from && to && from > to) {
      errors.push({ field: 'from', message: 'from must not be later than to' });
    }
    return errors.length ? next(fail(errors)) : next();
  };
}

// ----------------------------------------------------------------- suppliers
function supplier({ partial = false } = {}) {
  return (req, res, next) => {
    try {
      requireBodyObject(req);
      const errors = [];
      const req_ = !partial;
      const data = {
        business_name: readText(req.body, 'business_name', errors, { required: req_, min: 2, max: 120, label: 'Business name' }),
        contact_person: readText(req.body, 'contact_person', errors, { required: req_, min: 2, max: 100, label: 'Contact person' }),
        phone: readPhone(req.body, 'phone', errors, { required: req_ }),
        address: readText(req.body, 'address', errors, { required: req_, min: 5, max: 255, label: 'Address' }),
        province: undefined,
      };
      if (req.body.province !== undefined && req.body.province !== null && req.body.province !== '') {
        const match = PROVINCES.find((p) => p.toLowerCase() === String(req.body.province).trim().toLowerCase());
        if (match) data.province = match;
        else errors.push({ field: 'province', message: `province must be one of: ${PROVINCES.join(', ')}` });
      } else if (req_) {
        errors.push({ field: 'province', message: 'province is required' });
      }
      if (partial) onlyIfAnyField(data, errors);
      if (errors.length) throw fail(errors);
      req.body = data;
      next();
    } catch (err) { next(err); }
  };
}

// ----------------------------------------------------------------- fruits
function fruit({ partial = false } = {}) {
  return (req, res, next) => {
    try {
      requireBodyObject(req);
      const errors = [];
      const data = {
        fruit_name: readText(req.body, 'fruit_name', errors, { required: !partial, min: 2, max: 60, label: 'Fruit name' }),
        description: readText(req.body, 'description', errors, { required: false, max: 255, label: 'Description' }),
        status: undefined,
      };
      if (req.body.status !== undefined) {
        const st = String(req.body.status).trim().toUpperCase();
        if (FRUIT_STATUSES.includes(st)) data.status = st;
        else errors.push({ field: 'status', message: 'status must be ACTIVE or DISCONTINUED' });
      }
      if (partial) onlyIfAnyField(data, errors);
      if (errors.length) throw fail(errors);
      req.body = data;
      next();
    } catch (err) { next(err); }
  };
}

function fruitListQuery(req, res, next) {
  if (req.query.status === undefined) return next();
  const st = String(req.query.status).toUpperCase();
  if (![...FRUIT_STATUSES, 'ALL'].includes(st)) return next(badRequest('status must be ACTIVE, DISCONTINUED or ALL'));
  req.query.status = st;
  return next();
}

// ----------------------------------------------------------------- vendors
function vendor({ partial = false } = {}) {
  return (req, res, next) => {
    try {
      requireBodyObject(req);
      const errors = [];
      const data = {
        vendor_name: readText(req.body, 'vendor_name', errors, { required: !partial, min: 2, max: 120, label: 'Vendor name' }),
        phone_number: readPhone(req.body, 'phone_number', errors, { required: !partial }),
        location: readText(req.body, 'location', errors, { required: !partial, min: 2, max: 150, label: 'Location' }),
        registration_date: undefined,
      };
      if (req.body.registration_date !== undefined && req.body.registration_date !== null && req.body.registration_date !== '') {
        if (isRealDate(String(req.body.registration_date))) data.registration_date = req.body.registration_date;
        else errors.push({ field: 'registration_date', message: 'registration_date must be a real date in YYYY-MM-DD format' });
      }
      if (partial) onlyIfAnyField(data, errors);
      if (errors.length) throw fail(errors);
      req.body = data;
      next();
    } catch (err) { next(err); }
  };
}

function vendorSearch(req, res, next) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return next(badRequest('Search text "q" must be at least 2 characters (vendor name or phone number)'));
  req.query.q = q;
  return next();
}

// ----------------------------------------------------------------- stock / prices
function reorderLevel(req, res, next) {
  try {
    requireBodyObject(req);
    const n = req.body.reorder_level;
    if (!Number.isInteger(n) || n < 0 || n > MAX_QTY) {
      throw fail([{ field: 'reorder_level', message: `reorder_level must be a whole number from 0 to ${MAX_QTY}` }]);
    }
    next();
  } catch (err) { next(err); }
}

function lowStockQuery(req, res, next) {
  if (req.query.threshold === undefined) return next();
  const n = /^\d+$/.test(String(req.query.threshold)) ? parseInt(req.query.threshold, 10) : NaN;
  if (Number.isNaN(n) || n > MAX_QTY) return next(badRequest('threshold must be a whole number (0 or more)'));
  req.query.threshold = n;
  return next();
}

function price(req, res, next) {
  try {
    requireBodyObject(req);
    const errors = [];
    const fruitId = readPositiveInt(req.body.fruit_id);
    if (fruitId === null) errors.push({ field: 'fruit_id', message: 'fruit_id must be a positive whole number' });
    const size = readSize(req.body.packaging_size);
    if (size === null) errors.push({ field: 'packaging_size', message: 'packaging_size must be SMALL, MEDIUM or LARGE' });
    const cents = parseMoney(req.body.unit_price);
    if (cents === null || cents <= 0) errors.push({ field: 'unit_price', message: 'unit_price must be a positive amount with at most 2 decimals' });
    if (errors.length) throw fail(errors);
    req.body = { fruit_id: fruitId, packaging_size: size, unit_price_cents: cents };
    next();
  } catch (err) { next(err); }
}

// ----------------------------------------------------------------- purchases
function purchase(req, res, next) {
  try {
    requireBodyObject(req);
    const errors = [];
    const supplierId = readPositiveInt(req.body.supplier_id);
    if (supplierId === null) errors.push({ field: 'supplier_id', message: 'supplier_id must be a positive whole number' });
    const items = readItems(req.body, errors, { withCost: true });
    if (errors.length) throw fail(errors);
    req.body = { supplier_id: supplierId, items };
    next();
  } catch (err) { next(err); }
}

// ----------------------------------------------------------------- sales
function sale(req, res, next) {
  try {
    requireBodyObject(req);
    const errors = [];
    const vendorId = readPositiveInt(req.body.vendor_id);
    if (vendorId === null) errors.push({ field: 'vendor_id', message: 'vendor_id must be a positive whole number' });
    const items = readItems(req.body, errors, { withCost: false });

    let method = 'CASH';
    if (req.body.payment_method !== undefined) {
      method = String(req.body.payment_method).trim().toUpperCase();
      if (!PAYMENT_METHODS.includes(method)) {
        errors.push({ field: 'payment_method', message: `payment_method must be one of: ${PAYMENT_METHODS.join(', ')}` });
      }
    }

    let paidCents; // undefined = "not specified"
    if (req.body.amount_paid !== undefined && req.body.amount_paid !== null && req.body.amount_paid !== '') {
      paidCents = parseMoney(req.body.amount_paid);
      if (paidCents === null) errors.push({ field: 'amount_paid', message: 'amount_paid must be 0 or a positive amount with at most 2 decimals' });
    }
    if (method === 'CREDIT' && paidCents !== undefined && paidCents !== null && paidCents > 0) {
      errors.push({ field: 'amount_paid', message: 'A CREDIT sale starts unpaid. Use CASH or MOBILE_MONEY to record a deposit' });
    }
    if (method !== 'CREDIT' && paidCents === 0) {
      errors.push({ field: 'amount_paid', message: 'amount_paid of 0 means credit. Use payment_method CREDIT instead' });
    }

    let reference = null;
    if (req.body.payment_reference !== undefined && req.body.payment_reference !== null && req.body.payment_reference !== '') {
      reference = readText(req.body, 'payment_reference', errors, { required: false, max: 60, label: 'Payment reference' }) || null;
    }
    if (errors.length) throw fail(errors);
    req.body = { vendor_id: vendorId, items, payment_method: method, amount_paid_cents: paidCents, payment_reference: reference };
    next();
  } catch (err) { next(err); }
}

function salePayment(req, res, next) {
  try {
    requireBodyObject(req);
    const errors = [];
    const cents = parseMoney(req.body.amount);
    if (cents === null || cents <= 0) errors.push({ field: 'amount', message: 'amount must be a positive amount with at most 2 decimals' });
    const method = String(req.body.method || '').trim().toUpperCase();
    if (!RECEIPT_METHODS.includes(method)) errors.push({ field: 'method', message: `method must be one of: ${RECEIPT_METHODS.join(', ')}` });
    const reference = readText(req.body, 'reference', errors, { required: false, max: 60, label: 'Reference' }) || null;
    if (errors.length) throw fail(errors);
    req.body = { amount_cents: cents, method, reference };
    next();
  } catch (err) { next(err); }
}

function saleListQuery(req, res, next) {
  const errors = [];
  if (req.query.vendor_id !== undefined) {
    const id = readPositiveInt(req.query.vendor_id);
    if (id === null) errors.push({ field: 'vendor_id', message: 'vendor_id must be a positive whole number' });
    else req.query.vendor_id = id;
  }
  if (req.query.status !== undefined) {
    const st = String(req.query.status).toUpperCase();
    if (!['PAID', 'PARTIALLY_PAID', 'UNPAID'].includes(st)) errors.push({ field: 'status', message: 'status must be PAID, PARTIALLY_PAID or UNPAID' });
    else req.query.status = st;
  }
  return errors.length ? next(fail(errors)) : next();
}

module.exports = {
  PROVINCES, SIZES,
  idParam, sizeParam, dateRange,
  supplier, fruit, fruitListQuery, vendor, vendorSearch,
  reorderLevel, lowStockQuery, price, purchase, sale, salePayment, saleListQuery,
};
