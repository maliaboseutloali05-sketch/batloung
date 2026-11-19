'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/reportController');
const v = require('../middleware/validators');

router.get('/top-fruits', ctrl.topFruits);
router.get('/revenue', v.dateRange({ required: true }), ctrl.revenue);
router.get('/top-vendor', ctrl.topVendor);
router.get('/stock-levels', ctrl.stockLevels);
router.get('/outstanding-balances', ctrl.outstanding);

module.exports = router;
