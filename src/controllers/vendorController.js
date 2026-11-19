'use strict';
const vendorModel = require('../models/vendorModel');
const asyncHandler = require('../middleware/asyncHandler');
const { notFound } = require('../utils/httpError');

const missing = (id) => notFound(`Vendor ${id} was not found`);

exports.create = asyncHandler(async (req, res) => {
  const vendor = await vendorModel.create(req.body);
  res.status(201).json({ success: true, message: 'Vendor registered', data: vendor });
});

exports.list = asyncHandler(async (req, res) => {
  const vendors = await vendorModel.findAll();
  res.status(200).json({ success: true, count: vendors.length, data: vendors });
});

exports.search = asyncHandler(async (req, res) => {
  const vendors = await vendorModel.search(req.query.q);
  res.status(200).json({ success: true, count: vendors.length, data: vendors });
});

exports.getOne = asyncHandler(async (req, res) => {
  const vendor = await vendorModel.findById(req.params.id);
  if (!vendor) throw missing(req.params.id);
  res.status(200).json({ success: true, data: vendor });
});

exports.update = asyncHandler(async (req, res) => {
  if (!(await vendorModel.findById(req.params.id))) throw missing(req.params.id);
  const vendor = await vendorModel.update(req.params.id, req.body);
  res.status(200).json({ success: true, message: 'Vendor updated', data: vendor });
});

// GET /api/vendors/balances            -> everyone
// GET /api/vendors/balances?owing=true -> only vendors who still owe money
exports.balances = asyncHandler(async (req, res) => {
  const rows = await vendorModel.balances({ onlyOwing: req.query.owing === 'true' });
  const totalOutstanding = rows.reduce((sum, r) => sum + Math.round(r.outstanding_balance * 100), 0) / 100;
  res.status(200).json({ success: true, count: rows.length, total_outstanding: totalOutstanding, data: rows });
});

exports.balanceOne = asyncHandler(async (req, res) => {
  const balance = await vendorModel.balanceFor(req.params.id);
  if (!balance) throw missing(req.params.id);
  res.status(200).json({ success: true, data: balance });
});
