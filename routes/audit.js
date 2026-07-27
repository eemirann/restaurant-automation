const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getAuditLog } = require('../controllers/auditController');

router.get('/', verifyToken, requireRole('Admin'), getAuditLog);

module.exports = router;
