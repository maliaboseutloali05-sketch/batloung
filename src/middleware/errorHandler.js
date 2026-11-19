'use strict';
const { HttpError } = require('../utils/httpError');

/** Unknown /api route -> 404 JSON (instead of Express' default HTML page). */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.originalUrl} does not exist` },
  });
}

// Connection-level failures: the database is the problem, not the request -> 503.
const DB_DOWN_CODES = new Set([
  'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET',
  'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'POOL_CLOSED',
]);

/** Translate low-level MySQL / body-parser errors into meaningful HTTP responses. */
function toHttpError(err) {
  if (err instanceof HttpError) return err;

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') return new HttpError(400, 'Request body is not valid JSON');
  if (err.type === 'entity.too.large') return new HttpError(400, 'Request body is too large');

  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return new HttpError(409, 'A record with the same unique value already exists', { reason: err.sqlMessage });
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      return new HttpError(409, 'This record is used by other records and cannot be deleted');
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      return new HttpError(400, 'A referenced record (supplier, vendor, fruit or sale) does not exist');
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return new HttpError(400, 'A database rule was violated (for example negative stock or an invalid amount)', {
        reason: err.sqlMessage,
      });
    case 'ER_DATA_TOO_LONG':
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_BAD_NULL_ERROR':
    case 'WARN_DATA_TRUNCATED':
      return new HttpError(400, 'One or more values are missing or have an invalid format', { reason: err.sqlMessage });
    case 'ER_ACCESS_DENIED_ERROR':
      return new HttpError(503, 'Database login failed. Check DB_USER and DB_PASSWORD in the .env file');
    case 'ER_BAD_DB_ERROR':
      return new HttpError(503, 'Database does not exist. Run "npm run db:setup" first');
    case 'ER_NO_SUCH_TABLE':
      return new HttpError(503, 'Database tables are missing. Run "npm run db:setup" first');
    case 'ER_LOCK_DEADLOCK':
    case 'ER_LOCK_WAIT_TIMEOUT':
      return new HttpError(503, 'The system is busy. Please retry the request');
    default:
      break;
  }

  if (DB_DOWN_CODES.has(err.code)) {
    return new HttpError(503, 'The database is currently unreachable. Please try again shortly');
  }
  return new HttpError(500, 'Unexpected server error');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const httpError = toHttpError(err);
  if (httpError.status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err.code || '', err.message);
  }
  const body = { success: false, error: { message: httpError.message } };
  if (httpError.details !== undefined) body.error.details = httpError.details;
  res.status(httpError.status).json(body);
}

module.exports = { notFoundHandler, errorHandler, toHttpError };
