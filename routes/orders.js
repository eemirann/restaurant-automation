const express = require('express');
const router = express.Router();
const { createOrder, getAllOrders, getOrderById, cancelOrder, updateOrderStatus, addOrderItems } = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.post('/', verifyToken, createOrder);
router.get('/', verifyToken, getAllOrders);
router.get('/:id', verifyToken, getOrderById);
router.post('/:id/items', verifyToken, addOrderItems);                // aktif siparişe ürün ekle
router.patch('/:id/status', verifyToken, updateOrderStatus);          // Herkes yapabilir (Waiter/Cashier/Admin) - sadece Pending/Served arası
router.patch('/:id/cancel', verifyToken, requireRole('Admin'), cancelOrder);           //Admine özel iptal databasede saklanıyor , stok geri ekleniyor

module.exports = router;