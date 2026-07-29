const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getInvoiceProviderSettings, updateInvoiceProviderSettings } = require('../controllers/invoiceProviderSettingsController');

// SADECE ADMIN — bir API anahtarı taşıdığı için GET dahil kimlik doğrulamalı.
router.get('/', verifyToken, requireRole('Admin'), getInvoiceProviderSettings);
router.put('/', verifyToken, requireRole('Admin'), updateInvoiceProviderSettings);

module.exports = router;
