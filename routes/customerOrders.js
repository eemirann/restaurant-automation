const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { getCustomerOrderRequests, approveCustomerOrderRequest, rejectCustomerOrderRequest } = require('../controllers/customerOrderController');

// Giriş yapmış herkes (Garson/Kasiyer/Admin) görebilir/onaylayabilir —
// masa transferi/sipariş durumu güncelleme ile aynı yetki deseni.
router.get('/', verifyToken, getCustomerOrderRequests);
router.post('/:id/approve', verifyToken, approveCustomerOrderRequest);
router.post('/:id/reject', verifyToken, rejectCustomerOrderRequest);

module.exports = router;
