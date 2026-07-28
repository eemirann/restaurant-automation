const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getAllExtras, createExtra, updateExtra, deleteExtra } = require('../controllers/extraController');

// Giriş yapmış herkes listeleyebilir (sipariş ekranında ekstra seçimi için)
router.get('/', verifyToken, getAllExtras);

// SADECE ADMIN
router.post('/', verifyToken, requireRole('Admin'), createExtra);
router.put('/:id', verifyToken, requireRole('Admin'), updateExtra);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteExtra);

module.exports = router;
