const express = require('express');
const router = express.Router();
const { createPayment, getPaymentsByOrder, deletePayment, refundPayment } = require('../controllers/paymentController');

// Herkes erişebilir (garson dahil - normal ödeme akışı)
router.post('/', createPayment);
router.get('/order/:orderId', getPaymentsByOrder);

// SADECE YÖNETİCİ - garson bu iki işlemi yapamayacak
// TODO: Auth eklendiğinde buraya requireRole('manager') gibi bir middleware takılacak
// Örnek: router.delete('/:id', requireRole('manager'), deletePayment);
// Örnek: router.post('/:id/refund', requireRole('manager'), refundPayment);
router.delete('/:id', deletePayment);
router.post('/:id/refund', refundPayment);

module.exports = router;