const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getSalesReport, getZReport, getProductsReport } = require('../controllers/reportController');

// Raporlar kasiyer ve yöneticiye açık (garson göremez)
router.get('/sales', verifyToken, requireRole('Cashier', 'Admin'), getSalesReport);
router.get('/z-report', verifyToken, requireRole('Cashier', 'Admin'), getZReport);
router.get('/products', verifyToken, requireRole('Cashier', 'Admin'), getProductsReport);

module.exports = router;
