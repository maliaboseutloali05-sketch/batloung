'use strict';
const router = require('express').Router();

router.use('/suppliers', require('./supplierRoutes'));
router.use('/fruits', require('./fruitRoutes'));
router.use('/prices', require('./priceRoutes'));
router.use('/stock', require('./stockRoutes'));
router.use('/vendors', require('./vendorRoutes'));
router.use('/purchases', require('./purchaseRoutes'));
router.use('/sales', require('./salesRoutes'));
router.use('/reports', require('./reportRoutes'));

module.exports = router;
