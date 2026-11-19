'use strict';
const { badRequest } = require('./httpError');

/**
 * The same fruit + size may appear twice in one request ("5 small apples" and later "3 small apples").
 * They are merged into ONE line so stock checks add up correctly (10 + 10 must be checked against 20,
 * not against 10 twice). Purchases with the same fruit+size but different unit costs are ambiguous
 * and are rejected.
 *
 * Returns lines sorted by (fruit_id, packaging_size) which is also the stock-locking order.
 */
function mergeItems(items) {
  const merged = new Map();
  for (const item of items) {
    const key = `${item.fruit_id}:${item.packaging_size}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }
    if (item.unit_cost_cents !== undefined && existing.unit_cost_cents !== item.unit_cost_cents) {
      throw badRequest(
        `Fruit ${item.fruit_id} (${item.packaging_size}) is listed twice with different unit costs. Combine them into one line`
      );
    }
    existing.quantity += item.quantity;
  }
  const order = { SMALL: 0, MEDIUM: 1, LARGE: 2 };
  return [...merged.values()].sort(
    (a, b) => a.fruit_id - b.fruit_id || order[a.packaging_size] - order[b.packaging_size]
  );
}

module.exports = { mergeItems };
