const express = require('express');
const router = express.Router();
const { getAllTables, transferTable, getTableById, updateTableStatus, createTable, updateTable, deleteTable, getTableQrCodes } = require('../controllers/tableController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

router.get('/', verifyToken, getAllTables);
// '/:id'den ÖNCE tanımlanmalı — aksi halde Express 'qrcodes'ı bir TableId
// sanıp getTableById'a yönlendirir.
router.get('/qrcodes', verifyToken, requireRole('Admin'), getTableQrCodes);
router.get('/:id', verifyToken, getTableById);                    // masa detayı + varsa aktif siparişi
router.patch('/:id/status', verifyToken, updateTableStatus);      // elle Empty/Occupied/Reserved (aktif sipariş yoksa)
router.post('/:tableId/transfer', verifyToken, transferTable);   // herkes yapabilir (Waiter/Cashier/Admin), toggle ile ileride kısıtlanabilir
router.post('/', verifyToken, requireRole('Admin'), createTable);
router.patch('/:id', verifyToken, requireRole('Admin'), updateTable);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteTable);

module.exports = router;