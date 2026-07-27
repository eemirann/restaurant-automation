const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getCurrentShift, openShift, closeShift, listShifts } = require('../controllers/shiftController');

// Kendi vardiyası — giriş yapan herkes (garson/kasiyer/admin)
router.get('/current', verifyToken, getCurrentShift);
router.post('/open', verifyToken, openShift);
router.post('/close', verifyToken, closeShift);

// Tüm vardiya geçmişi — Admin
router.get('/', verifyToken, requireRole('Admin'), listShifts);

module.exports = router;
