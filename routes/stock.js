const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const {
    getStockByProduct,
    getAllStock,
    createStockItem,
    updateStockItem,
    deleteStockItem,
    reactivateStockItem,
    increaseStock,
    decreaseStock,
    getAllStockMovements,
    recordStockPurchase,
    setStockItemType
} = require('../controllers/stockController');

router.get('/movements', verifyToken, getAllStockMovements);
router.get('/product/:productId', verifyToken, requireRole('Admin'), getStockByProduct);
router.get('/', verifyToken, getAllStock);
router.post('/', verifyToken, requireRole('Admin'), createStockItem);
router.put('/:id', verifyToken, requireRole('Admin'), updateStockItem);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteStockItem);
router.patch('/:id/reactivate', verifyToken, requireRole('Admin'), reactivateStockItem);
router.patch('/:id/increase', verifyToken, requireRole('Admin'), increaseStock);
router.patch('/:id/decrease', verifyToken, requireRole('Admin'), decreaseStock);
router.post('/:id/purchase', verifyToken, requireRole('Admin'), recordStockPurchase);
router.patch('/:id/type', verifyToken, requireRole('Admin'), setStockItemType);

module.exports = router;
