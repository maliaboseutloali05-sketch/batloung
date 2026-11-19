'use strict';

/**
 * Builds "UPDATE table SET a = ?, b = ? WHERE id = ?" from a whitelist of columns.
 * Only keys listed in `allowed` are ever written, so request bodies can't touch other columns.
 * Returns null when there is nothing to update.
 */
function buildUpdate(table, idColumn, id, data, allowed) {
  const columns = Object.keys(data).filter((key) => allowed.includes(key) && data[key] !== undefined);
  if (columns.length === 0) return null;
  const sql = `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE ${idColumn} = ?`;
  return { sql, params: [...columns.map((c) => data[c]), id] };
}

/** Escape % and _ so user text is matched literally inside LIKE. */
function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

module.exports = { buildUpdate, escapeLike };
