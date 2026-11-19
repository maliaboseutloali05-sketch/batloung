'use strict';
const stockModel = require('../models/stockModel');
const fruitModel = require('../models/fruitModel');
const asyncHandler = require('../middleware/asyncHandler');
const { notFound } = require('../utils/httpError');

exports.all = asyncHandler(async (req, res) => {
  const stock = await stockModel.findAll();
  res.status(200).json({ success: true, count: stock.length, data: stock });
});

exports.byFruit = asyncHandler(async (req, res) => {
  const fruit = await fruitModel.findById(req.params.fruitId);
  if (!fruit) throw notFound(`Fruit ${req.params.fruitId} was not found`);
  const sizes = await stockModel.findByFruit(req.params.fruitId);
  const total = sizes.reduce((sum, s) => sum + s.available_quantity, 0);
  res.status(200).json({
    success: true,
    data: { fruit_id: fruit.fruit_id, fruit_name: fruit.fruit_name, total_boxes: total, sizes },
  });
});

exports.low = asyncHandler(async (req, res) => {
  const items = await stockModel.findLow(req.query.threshold);
  res.status(200).json({
    success: true,
    count: items.length,
    rule: req.query.threshold === undefined
      ? 'available_quantity <= the reorder_level of that fruit and size'
      : `available_quantity <= ${req.query.threshold}`,
    data: items,
  });
});

exports.setReorderLevel = asyncHandler(async (req, res) => {
  const { fruitId, size } = req.params;
  const changed = await stockModel.setReorderLevel(fruitId, size, req.body.reorder_level);
  if (!changed) throw notFound(`No stock row exists for fruit ${fruitId} (${size})`);
  res.status(200).json({ success: true, message: 'Reorder level updated' });
});

exports.movements = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const rows = await stockModel.movements({
    fruitId: req.query.fruit_id ? parseInt(req.query.fruit_id, 10) : undefined,
    size: req.query.size ? String(req.query.size).toUpperCase() : undefined,
    limit,
  });
  res.status(200).json({ success: true, count: rows.length, data: rows });
});
