const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getAllCustomers, getCustomerByUsername, redeemLoyaltyProduct } = require('../controllers/loyaltyController');

// Müşteri listesi (Customers.jsx) — Admin+Cashier, genel görünürlük/yönetim.
router.get('/', verifyToken, requireRole('Admin', 'Cashier'), getAllCustomers);

// Giriş yapmış herkes (Garson/Kasiyer/Admin) — ödeme/sipariş ekranında
// puanla ürün ekleme akışı için (bkz. Tables.jsx).
router.get('/:username', verifyToken, getCustomerByUsername);
router.post('/redeem', verifyToken, redeemLoyaltyProduct);

module.exports = router;
