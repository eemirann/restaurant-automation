const express = require('express');
const router = express.Router();
const { createReservation, cancelReservation, getReservations } = require('../controllers/reservationController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.get('/', verifyToken, getReservations);
router.post('/', verifyToken, requireRole('Cashier', 'Admin'), createReservation);
router.patch('/:id/cancel', verifyToken, requireRole('Cashier', 'Admin'), cancelReservation);

module.exports = router;