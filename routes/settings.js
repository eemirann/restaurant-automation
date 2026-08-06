const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadLogo: uploadLogoMiddleware } = require('../middleware/upload');
const { getSettings, updateSettings, backupNow, getBackups, uploadLogo, removeLogo } = require('../controllers/settingsController');

// Herkese açık (login ekranı dahil — kimlik doğrulanmadan önce de marka
// adı/rengi gösterilebilsin diye). Hassas veri içermiyor.
router.get('/', getSettings);

// SADECE ADMIN
router.put('/', verifyToken, requireRole('Admin'), updateSettings);

// Logo — SADECE ADMIN. Ürün resmi yüklemesiyle aynı desen (bkz.
// routes/products.js: POST /:id/image), PUT /'in genel akışına dahil değil.
router.post('/logo', verifyToken, requireRole('Admin'), uploadLogoMiddleware.single('logo'), uploadLogo);
router.delete('/logo', verifyToken, requireRole('Admin'), removeLogo);

// Otomatik Yedekleme — SADECE ADMIN
router.post('/backup-now', verifyToken, requireRole('Admin'), backupNow);
router.get('/backups', verifyToken, requireRole('Admin'), getBackups);

module.exports = router;
