const express = require('express');
const router = express.Router();
const { getAllUnits } = require('../controllers/unitsController');
const { verifyToken } = require('../middleware/authMiddleware');

// Herhangi bir personel okuyabilir (ör. Reçeteler/Ekstralar/Şuruplar
// formlarındaki birim dropdown'u).
router.get('/', verifyToken, getAllUnits);

module.exports = router;
