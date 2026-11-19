'use strict';
const reportModel = require('../models/reportModel');
const vendorModel = require('../models/vendorModel');
const asyncHandler = require('../middleware/asyncHandler');

exports.topFruits = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
  const data = await reportModel.topFruits(limit);
  res.status(200).json({ success: true, report: `Top ${limit} most frequently sold fruits (boxes)`, data });
});

exports.revenue = asyncHandler(async (req, res) => {
  const data = await reportModel.revenueBetween(req.query.from, req.query.to);
  res.status(200).json({ success: true, report: 'Sales revenue for the date range', data });
});

exports.topVendor = asyncHandler(async (req, res) => {
  const data = await reportModel.topVendors();
  res.status(200).json({ success: true, report: 'Vendor(s) who bought the most boxes', data });
});

exports.stockLevels = asyncHandler(async (req, res) => {
  const data = await reportModel.stockLevels();
  res.status(200).json({ success: true, report: 'Current stock per fruit and packaging size', count: data.length, data });
});

exports.outstanding = asyncHandler(async (req, res) => {
  const data = await vendorModel.balances({ onlyOwing: true });
  res.status(200).json({ success: true, report: 'Vendors with outstanding balances', count: data.length, data });
});
