const express = require('express');
const router = express.Router();
const { getAllCategories , getCategoriesById , createCategory } = require('../controllers/categoryController');

router.get('/', getAllCategories);
router.get('/:id', getCategoriesById);
router.post('/', createCategory);

module.exports = router;