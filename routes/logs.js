const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getRecentLogs } = require('../controllers/logsController');

// SADECE ADMIN — teknik/hata günlüğü (bkz. utils/logger.js, middleware/errorHandler.js).
router.get('/recent', verifyToken, requireRole('Admin'), getRecentLogs);

module.exports = router;
