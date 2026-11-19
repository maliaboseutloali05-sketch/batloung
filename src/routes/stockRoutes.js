'use strict';
const router = require('express').Router();
const ctrl = require('../controllers/stockController');
const v = require('../middleware/validators');

router.get('/', ctrl.all);                                            // every fruit x size
router.get('/low', v.lowStockQuery, ctrl.low);                        // low-stock alert list
router.get('/movements', ctrl.movements);                             // ledger of boxes in / out
router.get('/fruit/:fruitId', v.idParam('fruitId'), ctrl.byFruit);    // one fruit, small/medium/large
router.put('/fruit/:fruitId/:size/reorder-level',
  v.idParam('fruitId'), v.sizeParam('size'), v.reorderLevel, ctrl.setReorderLevel);

module.exports = router;
