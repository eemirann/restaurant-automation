const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getAllCategories , getCategoriesById , createCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');

router.get('/', verifyToken, getAllCategories);
router.get('/:id', verifyToken, getCategoriesById);
router.post('/', verifyToken, requireRole('Admin'), createCategory);
router.put('/:id', verifyToken, requireRole('Admin'), updateCategory);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteCategory);

module.exports = router;