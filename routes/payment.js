const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const {
    createPayment,
    getPaymentsByOrder,
    getOrderBalance,
    deletePayment,
    restorePayment,
    refundPayment
} = require('../controllers/paymentController');

// SADECE KASİYER/YÖNETİCİ ödeme alabilir — Garson hesabı göremez/kapatamaz,
// sadece sipariş girer. (Daha önce herkese açıktı, bilerek kısıtlandı.)
router.post('/', verifyToken, requireRole('Cashier', 'Admin'), createPayment);
router.get('/order/:orderId', verifyToken, getPaymentsByOrder);
router.get('/order/:orderId/balance', verifyToken, getOrderBalance);

// SADECE ADMIN - garson ve kasiyer bu işlemleri yapamaz
router.delete('/:id', verifyToken, requireRole('Admin'), deletePayment);
router.patch('/:id/restore', verifyToken, requireRole('Admin'), restorePayment);
router.post('/:id/refund', verifyToken, requireRole('Admin'), refundPayment);

module.exports = router;