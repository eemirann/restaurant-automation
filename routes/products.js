const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const {
    getAllProducts, getProductById, createProduct, updateProduct, deleteProduct,
    reactivateProduct, uploadProductImage, setProductAvailability,
    getProductOptions, saveProductOptions, getProductOrderOptions,
} = require('../controllers/productController');

router.get('/', verifyToken, getAllProducts);
router.get('/:id', verifyToken, getProductById);
router.post('/', verifyToken, requireRole('Admin'), createProduct);
router.put('/:id', verifyToken, requireRole('Admin'), updateProduct);
router.patch('/:id/activate', verifyToken, requireRole('Admin'), reactivateProduct);
router.patch('/:id/availability', verifyToken, requireRole('Admin'), setProductAvailability);
router.post('/:id/image', verifyToken, requireRole('Admin'), upload.single('image'), uploadProductImage);
router.get('/:id/options', verifyToken, requireRole('Admin'), getProductOptions);
router.put('/:id/options', verifyToken, requireRole('Admin'), saveProductOptions);
router.get('/:id/order-options', verifyToken, getProductOrderOptions);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteProduct);

module.exports = router;