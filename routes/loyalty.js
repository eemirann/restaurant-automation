const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { getCustomerByUsername, redeemLoyaltyProduct } = require('../controllers/loyaltyController');

// Giriş yapmış herkes (Garson/Kasiyer/Admin) — ödeme/sipariş ekranında
// puanla ürün ekleme akışı için (bkz. Tables.jsx).
router.get('/:username', verifyToken, getCustomerByUsername);
router.post('/redeem', verifyToken, redeemLoyaltyProduct);

module.exports = router;
