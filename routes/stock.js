const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const {
    getAllStock,
    createStockItem,
    updateStockItem,
    deleteStockItem,
    increaseStock,
    decreaseStock,
    getAllStockMovements,
    recordStockPurchase
} = require('../controllers/stockController');

router.get('/movements', verifyToken, getAllStockMovements);
router.get('/', verifyToken, getAllStock);
router.post('/', verifyToken, requireRole('Admin'), createStockItem);
router.put('/:id', verifyToken, requireRole('Admin'), updateStockItem);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteStockItem);
router.patch('/:id/increase', verifyToken, requireRole('Admin'), increaseStock);
router.patch('/:id/decrease', verifyToken, requireRole('Admin'), decreaseStock);
router.post('/:id/purchase', verifyToken, requireRole('Admin'), recordStockPurchase);

module.exports = router;
