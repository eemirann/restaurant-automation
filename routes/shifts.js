const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const {
    getCurrentShift, openShift, openShiftFor, closeShift, listShifts,
    getActiveShifts, forceCloseShift, forceLogoutCashier, transferShift,
    deleteShift, restoreShift,
} = require('../controllers/shiftController');

// Kendi vardiyası — giriş yapan herkes
router.get('/current', verifyToken, getCurrentShift);
router.post('/open', verifyToken, openShift);
router.post('/close', verifyToken, closeShift);

// Yönetici (Admin) — gözetim & override
router.get('/active', verifyToken, requireRole('Admin'), getActiveShifts);
router.get('/', verifyToken, requireRole('Admin'), listShifts);
router.post('/:id/force-close', verifyToken, requireRole('Admin'), forceCloseShift);
router.post('/:id/force-logout', verifyToken, requireRole('Admin'), forceLogoutCashier);
router.post('/:id/transfer', verifyToken, requireRole('Admin'), transferShift);
router.post('/open-for', verifyToken, requireRole('Admin'), openShiftFor);
router.patch('/:id/delete', verifyToken, requireRole('Admin'), deleteShift);
router.patch('/:id/restore', verifyToken, requireRole('Admin'), restoreShift);

module.exports = router;
