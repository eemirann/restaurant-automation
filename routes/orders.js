const express = require('express');
const router = express.Router();
const {
    createOrder,
    getAllOrders,
    getOrderById,
    cancelOrder,
    updateOrderStatus,
    addOrderItems,
    removeOrderItem,
    updateOrderItemQuantity,
    getOrderHistory
} = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.post('/', verifyToken, createOrder);
router.get('/', verifyToken, getAllOrders);
router.get('/:id', verifyToken, getOrderById);
router.get('/:id/history', verifyToken, getOrderHistory);         // Zaman çizelgesi (AuditLog'dan bu siparişe ait kayıtlar)
router.post('/:id/items', verifyToken, addOrderItems);                // aktif siparişe ürün ekle
router.patch('/:id/items/:itemId', verifyToken, updateOrderItemQuantity); // kalem adedini güncelle (azaltma SADECE Cashier/Admin — controller içinde kontrol edilir)
router.delete('/:id/items/:itemId', verifyToken, requireRole('Cashier', 'Admin'), removeOrderItem); // kalemi siparişten çıkar — Garson yapamaz
router.patch('/:id/status', verifyToken, updateOrderStatus);          // Herkes yapabilir (Waiter/Cashier/Admin) - sadece Pending/Served arası
router.patch('/:id/cancel', verifyToken, requireRole('Admin'), cancelOrder);           //Admine özel iptal databasede saklanıyor , stok geri ekleniyor

module.exports = router;