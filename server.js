'use strict';
const app = require('./src/app');
const config = require('./src/config/env');
const { checkConnection, closePool } = require('./src/config/database');

// The process must NEVER die just because MySQL is down or a promise was forgotten somewhere.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandled promise rejection:', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaught exception:', err.message);
});

const server = app.listen(config.port, () => {
  console.log(`Batloung Farm API listening on port ${config.port} (${config.env})`);
  config.configWarnings.forEach((w) => console.warn(`[config] ${w}`));
  waitForDatabase();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${config.port} is already in use. Change PORT in .env`);
  else console.error('[server] failed to start:', err.message);
  process.exit(1);
});

/**
 * Check the database in the background and keep retrying with a growing delay.
 * The HTTP server stays up the whole time; requests that need the database get a clear 503.
 */
async function waitForDatabase(attempt = 1) {
  const result = await checkConnection();
  if (result.ok) {
    console.log(`[db] connected to "${config.db.database}" on ${config.db.host}:${config.db.port}`);
    return;
  }
  const delay = Math.min(30000, attempt * 5000);
  console.error(`[db] connection attempt ${attempt} failed (${result.code}): ${result.message}`);
  console.error(`[db] retrying in ${delay / 1000}s - the API stays online and answers 503 until MySQL is back`);
  setTimeout(() => waitForDatabase(attempt + 1), delay).unref();
}

async function shutdown(signal) {
  console.log(`\n${signal} received - shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
