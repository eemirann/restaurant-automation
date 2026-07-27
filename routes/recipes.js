const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const {
    getRecipeByProduct,
    addRecipeItem,
    updateRecipeItem,
    deleteRecipeItem
} = require('../controllers/recipeController');

// Bir menü ürününün reçetesini görüntüleme (giriş yapan herkes)
router.get('/:productId', verifyToken, getRecipeByProduct);

// Reçete düzenleme SADECE ADMIN
router.post('/', verifyToken, requireRole('Admin'), addRecipeItem);
router.put('/:id', verifyToken, requireRole('Admin'), updateRecipeItem);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteRecipeItem);

module.exports = router;
