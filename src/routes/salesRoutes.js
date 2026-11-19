'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/salesController');
const v = require('../middleware/validators');

router.post('/', v.sale, ctrl.create);
router.get('/', v.saleListQuery, v.dateRange(), ctrl.list);
router.get('/:id', v.idParam(), ctrl.getOne);
router.post('/:id/payments', v.idParam(), v.salePayment, ctrl.addPayment);

module.exports = router;
