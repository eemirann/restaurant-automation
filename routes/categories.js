const express = require('express');
const router = express.Router();
const { getAllCategories , getCategoriesById , createCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');

router.get('/', getAllCategories);
router.get('/:id', getCategoriesById);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;