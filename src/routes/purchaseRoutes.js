'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/purchaseController');
const v = require('../middleware/validators');

router.post('/', v.purchase, ctrl.create);
router.get('/', ctrl.list);
router.get('/:id', v.idParam(), ctrl.getOne);

module.exports = router;
