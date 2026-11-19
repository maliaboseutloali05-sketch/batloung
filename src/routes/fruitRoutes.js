'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/fruitController');
const stockCtrl = require('../controllers/stockController');
const v = require('../middleware/validators');

router.post('/', v.fruit(), ctrl.create);
router.get('/', v.fruitListQuery, ctrl.list);
router.get('/:id', v.idParam(), ctrl.getOne);
router.put('/:id', v.idParam(), v.fruit({ partial: true }), ctrl.update);
router.patch('/:id', v.idParam(), v.fruit({ partial: true }), ctrl.update);

// convenience alias: stock of one fruit, per packaging size
router.get('/:fruitId/stock', v.idParam('fruitId'), stockCtrl.byFruit);

module.exports = router;
