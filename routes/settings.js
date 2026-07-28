const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getSettings, updateSettings } = require('../controllers/settingsController');

// Herkese açık (login ekranı dahil — kimlik doğrulanmadan önce de marka
// adı/rengi gösterilebilsin diye). Hassas veri içermiyor.
router.get('/', getSettings);

// SADECE ADMIN
router.put('/', verifyToken, requireRole('Admin'), updateSettings);

module.exports = router;
