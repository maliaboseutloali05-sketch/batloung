'use strict';

/** Wraps an async controller so any rejected promise is forwarded to the error middleware. */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
