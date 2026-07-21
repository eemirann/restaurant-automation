const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// SADECE ADMIN - yeni kullanıcı (garson/kasiyer/admin) oluşturabilir
router.post('/register', verifyToken, requireRole('Admin'), register);

router.post('/login', login);

module.exports = router;