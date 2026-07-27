const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { getQueue, updateItemStatus } = require('../controllers/kdsController');

// Giriş yapan tüm personel mutfak kuyruğunu görebilir/güncelleyebilir
router.get('/queue', verifyToken, getQueue);
router.patch('/items/:orderDetailsId/status', verifyToken, updateItemStatus);

module.exports = router;
