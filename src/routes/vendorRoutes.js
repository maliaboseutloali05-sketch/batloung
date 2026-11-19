'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/vendorController');
const v = require('../middleware/validators');

router.post('/', v.vendor(), ctrl.create);
router.get('/', ctrl.list);

// fixed paths MUST be declared before "/:id" or Express would read "search" as an id
router.get('/search', v.vendorSearch, ctrl.search);
router.get('/balances', ctrl.balances);

router.get('/:id', v.idParam(), ctrl.getOne);
router.get('/:id/balance', v.idParam(), ctrl.balanceOne);
router.put('/:id', v.idParam(), v.vendor({ partial: true }), ctrl.update);
router.patch('/:id', v.idParam(), v.vendor({ partial: true }), ctrl.update);

module.exports = router;
