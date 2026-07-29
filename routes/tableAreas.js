const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { getAllAreas, createArea, updateArea, deleteArea } = require('../controllers/tableAreaController');

// Giriş yapmış herkes listeleyebilir (masa oluşturma/düzenleme formunda seçim için)
router.get('/', verifyToken, getAllAreas);

// SADECE ADMIN
router.post('/', verifyToken, requireRole('Admin'), createArea);
router.put('/:id', verifyToken, requireRole('Admin'), updateArea);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteArea);

module.exports = router;
