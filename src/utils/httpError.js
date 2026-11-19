'use strict';

/** An error that already knows which HTTP status it should become. */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

module.exports = {
  HttpError,
  badRequest: (msg, details) => new HttpError(400, msg, details),
  notFound: (msg) => new HttpError(404, msg),
  conflict: (msg, details) => new HttpError(409, msg, details),
};
