const express = require('express');
const router = express.Router();
const { createOrder, getAllOrders, getOrderById, cancelOrder } = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.post('/', verifyToken, createOrder);
router.get('/', verifyToken, getAllOrders);
router.get('/:id', verifyToken, getOrderById);
router.patch('/:id/cancel', verifyToken, requireRole('Admin'), cancelOrder);           //Admine özel iptal databasede saklanıyor , stok geri ekleniyor

module.exports = router;