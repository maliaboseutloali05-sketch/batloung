'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/supplierController');
const v = require('../middleware/validators');

router.post('/', v.supplier(), ctrl.create);
router.get('/', ctrl.list);
router.get('/:id', v.idParam(), ctrl.getOne);
router.put('/:id', v.idParam(), v.supplier({ partial: true }), ctrl.update);
router.patch('/:id', v.idParam(), v.supplier({ partial: true }), ctrl.update);
router.delete('/:id', v.idParam(), ctrl.remove);

module.exports = router;
