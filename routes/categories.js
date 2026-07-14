const express = require('express');
const router = express.Router();
const { getAllCategories , getCategoriesById } = require('../controllers/categoryController');

router.get('/', getAllCategories);
router.get('/:id', getCategoriesById);

module.exports = router;