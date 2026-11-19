'use strict';
const fruitModel = require('../models/fruitModel');
const priceModel = require('../models/priceModel');
const asyncHandler = require('../middleware/asyncHandler');
const { notFound } = require('../utils/httpError');

exports.create = asyncHandler(async (req, res) => {
  const fruit = await fruitModel.create(req.body);
  res.status(201).json({ success: true, message: 'Fruit registered. Set its selling prices with PUT /api/prices', data: fruit });
});

// By default only ACTIVE fruits ("available fruits"); use ?status=ALL or DISCONTINUED to widen.
exports.list = asyncHandler(async (req, res) => {
  const fruits = await fruitModel.findAll(req.query.status || 'ACTIVE');
  res.status(200).json({ success: true, count: fruits.length, data: fruits });
});

exports.getOne = asyncHandler(async (req, res) => {
  const fruit = await fruitModel.findById(req.params.id);
  if (!fruit) throw notFound(`Fruit ${req.params.id} was not found`);
  res.status(200).json({ success: true, data: fruit });
});

exports.update = asyncHandler(async (req, res) => {
  if (!(await fruitModel.findById(req.params.id))) throw notFound(`Fruit ${req.params.id} was not found`);
  const fruit = await fruitModel.update(req.params.id, req.body);
  res.status(200).json({ success: true, message: 'Fruit updated', data: fruit });
});

exports.listPrices = asyncHandler(async (req, res) => {
  const prices = await priceModel.findAll();
  res.status(200).json({ success: true, count: prices.length, data: prices });
});

exports.setPrice = asyncHandler(async (req, res) => {
  const price = await priceModel.upsert(req.body);
  res.status(200).json({ success: true, message: 'Selling price saved', data: price });
});
