'use strict';
const purchaseModel = require('../models/purchaseModel');
const asyncHandler = require('../middleware/asyncHandler');
const { notFound } = require('../utils/httpError');

exports.create = asyncHandler(async (req, res) => {
  const purchase = await purchaseModel.create(req.body);
  res.status(201).json({
    success: true,
    message: 'Purchase recorded and stock increased',
    data: purchase,
  });
});

exports.list = asyncHandler(async (req, res) => {
  const purchases = await purchaseModel.findAll({
    supplierId: req.query.supplier_id ? parseInt(req.query.supplier_id, 10) : undefined,
  });
  res.status(200).json({ success: true, count: purchases.length, data: purchases });
});

exports.getOne = asyncHandler(async (req, res) => {
  const purchase = await purchaseModel.findById(req.params.id);
  if (!purchase) throw notFound(`Purchase ${req.params.id} was not found`);
  res.status(200).json({ success: true, data: purchase });
});
