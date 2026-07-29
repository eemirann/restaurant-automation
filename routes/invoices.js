const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getAllInvoices, getInvoicesForOrder, createInvoice } = require('../controllers/invoiceController');

// Faturalar sayfası (tüm liste) sadece Admin'e açık
router.get('/', verifyToken, requireRole('Admin'), getAllInvoices);
// Sipariş bazlı görüntüleme/fatura kesme: Admin + Cashier (ödeme alan kasiyer fatura kesebilmeli)
router.get('/order/:orderId', verifyToken, requireRole('Admin', 'Cashier'), getInvoicesForOrder);
router.post('/order/:orderId', verifyToken, requireRole('Admin', 'Cashier'), createInvoice);

module.exports = router;
