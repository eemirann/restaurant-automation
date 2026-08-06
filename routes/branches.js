const express = require('express');
const router = express.Router();
const { getAllBranches } = require('../controllers/branchController');
const { verifyToken } = require('../middleware/authMiddleware');

// Herhangi bir personel okuyabilir (ör. kullanıcı oluşturma formundaki dropdown).
router.get('/', verifyToken, getAllBranches);

module.exports = router;
