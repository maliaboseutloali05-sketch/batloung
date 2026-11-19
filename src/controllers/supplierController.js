'use strict';
const supplierModel = require('../models/supplierModel');
const asyncHandler = require('../middleware/asyncHandler');
const { notFound, conflict } = require('../utils/httpError');

const missing = (id) => notFound(`Supplier ${id} was not found`);

exports.create = asyncHandler(async (req, res) => {
  const supplier = await supplierModel.create(req.body);
  res.status(201).json({ success: true, message: 'Supplier registered', data: supplier });
});

exports.list = asyncHandler(async (req, res) => {
  const suppliers = await supplierModel.findAll({ province: req.query.province, search: req.query.search });
  res.status(200).json({ success: true, count: suppliers.length, data: suppliers });
});

exports.getOne = asyncHandler(async (req, res) => {
  const supplier = await supplierModel.findById(req.params.id);
  if (!supplier) throw missing(req.params.id);
  res.status(200).json({ success: true, data: supplier });
});

exports.update = asyncHandler(async (req, res) => {
  if (!(await supplierModel.findById(req.params.id))) throw missing(req.params.id);
  const supplier = await supplierModel.update(req.params.id, req.body);
  res.status(200).json({ success: true, message: 'Supplier updated', data: supplier });
});

// Business constraint: a supplier we have already bought from is part of our financial history
// and may not be deleted (the foreign key would refuse anyway; this gives a clear message first).
exports.remove = asyncHandler(async (req, res) => {
  if (!(await supplierModel.findById(req.params.id))) throw missing(req.params.id);
  const purchases = await supplierModel.countPurchases(req.params.id);
  if (purchases > 0) {
    throw conflict(`Supplier ${req.params.id} has ${purchases} recorded purchase(s) and cannot be deleted`);
  }
  await supplierModel.remove(req.params.id);
  res.status(200).json({ success: true, message: 'Supplier deleted' });
});
