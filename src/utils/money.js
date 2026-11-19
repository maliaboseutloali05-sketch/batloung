'use strict';
// All money arithmetic is done in INTEGER CENTS so that 0.1 + 0.2 style rounding errors
// can never reach an invoice. Values are only turned back into "123.45" strings at the edge.

/** Parse user input (number or numeric string, max 2 decimals) into cents. Returns null if invalid. */
function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = typeof value === 'number' ? String(value) : String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return null;
  const [whole, frac = ''] = str.split('.');
  return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0'), 10);
}

/** DECIMAL columns arrive from mysql2 as strings such as "7500.00". */
function fromDb(value) {
  if (value === null || value === undefined) return 0;
  return Math.round(parseFloat(value) * 100);
}

/** cents -> "7500.00" (string, exactly 2 decimals) - safe to send to MySQL and to clients. */
function toMoneyString(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** cents -> number with 2 decimals, for JSON responses. */
function toNumber(cents) {
  return Number(toMoneyString(cents));
}

module.exports = { parseMoney, fromDb, toMoneyString, toNumber };
