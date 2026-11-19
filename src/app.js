'use strict';
const path = require('path');
const express = require('express');
const cors = require('cors');

const config = require('./config/env');
const { checkConnection } = require('./config/database');
const requestLogger = require('./middleware/requestLogger');
const { adminAuth } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use(requestLogger);

// Static admin dashboard (public/index.html)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check is open so uptime monitors / hosting platforms can reach it.
app.get('/api/health', async (req, res) => {
  const db = await checkConnection();
  res.status(db.ok ? 200 : 503).json({
    success: db.ok,
    service: 'Batloung Farm Distribution System',
    environment: config.env,
    database: db.ok ? 'connected' : { status: 'unreachable', code: db.code },
    warnings: config.configWarnings,
    time: new Date().toISOString(),
  });
});

app.use('/api', adminAuth, routes);
app.use('/api', notFoundHandler);
app.use(errorHandler);

module.exports = app;
