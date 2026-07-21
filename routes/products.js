const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getAllProducts , getProductById, createProduct, updateProduct, deleteProduct} = require('../controllers/productController');

router.get('/', verifyToken, getAllProducts);
router.get('/:id', verifyToken, getProductById);
router.post('/', verifyToken, requireRole('Admin'), createProduct);
router.put('/:id', verifyToken, requireRole('Admin'), updateProduct);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteProduct);

module.exports = router;