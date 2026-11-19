'use strict';

const PAYMENT_METHODS = ['CASH', 'MOBILE_MONEY', 'CREDIT'];
const RECEIPT_METHODS = ['CASH', 'MOBILE_MONEY']; // CREDIT means "pay later", so it is never a receipt

/** PAID / PARTIALLY_PAID / UNPAID from two integer-cent values. */
function paymentStatus(totalCents, paidCents) {
  if (paidCents <= 0) return 'UNPAID';
  if (paidCents < totalCents) return 'PARTIALLY_PAID';
  return 'PAID';
}

module.exports = { PAYMENT_METHODS, RECEIPT_METHODS, paymentStatus };
