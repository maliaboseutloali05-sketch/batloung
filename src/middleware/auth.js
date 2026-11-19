'use strict';
const crypto = require('crypto');
const config = require('../config/env');

/**
 * Optional administrator protection. When ADMIN_API_KEY is configured, every request
 * must carry a matching "x-api-key" header; otherwise the API is open (handy for local demos).
 */
function adminAuth(req, res, next) {
  if (!config.adminApiKey) return next();

  const supplied = Buffer.from(String(req.get('x-api-key') || ''));
  const expected = Buffer.from(config.adminApiKey);
  const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);

  if (!valid) {
    return res.status(401).json({
      success: false,
      error: { message: 'Administrator access required. Send a valid x-api-key header.' },
    });
  }
  return next();
}

module.exports = { adminAuth };
