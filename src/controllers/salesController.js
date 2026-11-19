'use strict';
const salesModel = require('../models/salesModel');
const asyncHandler = require('../middleware/asyncHandler');
const { notFound } = require('../utils/httpError');

exports.create = asyncHandler(async (req, res) => {
  const sale = await salesModel.create(req.body);
  res.status(201).json({
    success: true,
    message: `Sale recorded (${sale.payment_status}) and stock reduced`,
    data: sale,
  });
});

exports.list = asyncHandler(async (req, res) => {
  const sales = await salesModel.findAll({
    vendorId: req.query.vendor_id,
    status: req.query.status,
    from: req.query.from,
    to: req.query.to,
  });
  res.status(200).json({ success: true, count: sales.length, data: sales });
});

exports.getOne = asyncHandler(async (req, res) => {
  const sale = await salesModel.findById(req.params.id);
  if (!sale) throw notFound(`Sale ${req.params.id} was not found`);
  res.status(200).json({ success: true, data: sale });
});

exports.addPayment = asyncHandler(async (req, res) => {
  const sale = await salesModel.addPayment(req.params.id, req.body);
  res.status(201).json({
    success: true,
    message: `Payment recorded. Sale is now ${sale.payment_status}, balance due ${sale.balance_due.toFixed(2)}`,
    data: sale,
  });
});
