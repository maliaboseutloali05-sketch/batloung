'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/fruitController');
const v = require('../middleware/validators');

router.get('/', ctrl.listPrices);
router.put('/', v.price, ctrl.setPrice);

module.exports = router;
