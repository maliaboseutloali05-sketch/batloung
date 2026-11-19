'use strict';
// Loads .env once and exposes a typed, validated configuration object.
// Nothing sensitive is hard-coded: the DB password only ever comes from the environment.
require('dotenv').config();

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  adminApiKey: process.env.ADMIN_API_KEY || '',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'batloung_farm_dms',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
    ssl: String(process.env.DB_SSL).toLowerCase() === 'true',
  },
};

// Warn (do NOT crash) when configuration is incomplete: the server must stay alive
// so that /api/health can explain what is wrong.
const missing = ['DB_USER'].filter((key) => !process.env[key]);
config.configWarnings = missing.map((key) => `Environment variable ${key} is not set`);

module.exports = config;
