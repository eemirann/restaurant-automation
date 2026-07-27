const express = require('express');
const router = express.Router();
const { register, login, getStaff, loginWithPin, logout } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimiters');

// SADECE ADMIN - yeni kullanıcı (garson/kasiyer/admin) oluşturabilir
router.post('/register', verifyToken, requireRole('Admin'), register);

// Çıkış — denetim kaydı (token istemcide silinir)
router.post('/logout', verifyToken, logout);

// Brute-force koruması: giriş uçlarına deneme sınırı uygulanır
router.post('/login', loginLimiter, login);

// PIN ile giriş akışı - login ekranındaki personel seçimi ve PIN doğrulama
router.get('/staff', getStaff);
router.post('/login-pin', loginLimiter, loginWithPin);

module.exports = router;