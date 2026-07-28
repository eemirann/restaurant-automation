const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getAllSyrups, createSyrup, updateSyrup, deleteSyrup } = require('../controllers/syrupController');

// Giriş yapmış herkes listeleyebilir (sipariş ekranında şurup seçimi için)
router.get('/', verifyToken, getAllSyrups);

// SADECE ADMIN
router.post('/', verifyToken, requireRole('Admin'), createSyrup);
router.put('/:id', verifyToken, requireRole('Admin'), updateSyrup);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteSyrup);

module.exports = router;
