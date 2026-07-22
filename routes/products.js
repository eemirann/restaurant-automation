const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const { getAllProducts , getProductById, createProduct, updateProduct, deleteProduct, reactivateProduct, uploadProductImage} = require('../controllers/productController');

router.get('/', verifyToken, getAllProducts);
router.get('/:id', verifyToken, getProductById);
router.post('/', verifyToken, requireRole('Admin'), createProduct);
router.put('/:id', verifyToken, requireRole('Admin'), updateProduct);
router.patch('/:id/activate', verifyToken, requireRole('Admin'), reactivateProduct);
router.post('/:id/image', verifyToken, requireRole('Admin'), upload.single('image'), uploadProductImage);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteProduct);

module.exports = router;