const express = require('express');
const router = express.Router();
const { getAllTables, transferTable } = require('../controllers/tableController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/', verifyToken, getAllTables);
router.post('/:tableId/transfer', verifyToken, transferTable);   // herkes yapabilir (Waiter/Cashier/Admin), toggle ile ileride kısıtlanabilir

module.exports = router;