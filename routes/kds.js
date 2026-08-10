const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getQueue, updateItemStatus } = require('../controllers/kdsController');

// Giriş yapan tüm personel mutfak kuyruğunu GÖREBİLİR (Garson dahil — kendi
// siparişinin durumunu takip edebilsin diye). Durumu SADECE Mutfak/Kasiyer/
// Yönetici değiştirebilir — Garson mutfak ekranında salt-okunur.
router.get('/queue', verifyToken, getQueue);
router.patch('/items/:orderDetailsId/status', verifyToken, requireRole('Admin', 'Cashier', 'Kitchen'), updateItemStatus);

module.exports = router;
