'use strict';

/** Tiny access log: METHOD /url -> status (ms). Keeps the console readable during the demo video. */
module.exports = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api')) {
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started} ms)`);
    }
  });
  next();
};
