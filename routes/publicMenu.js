const express = require('express');
const router = express.Router();
const { publicMenuViewLimiter, publicMenuActionLimiter } = require('../middleware/rateLimiters');
const {
    getPublicMenu,
    getPublicMenuProductOptions,
    createCustomerOrderRequest,
    createServiceRequest,
    getPublicMenuStatus,
} = require('../controllers/publicMenuController');

// KİMLİK DOĞRULAMASIZ — anonim müşteri QR menüsü. Erişim tamamen
// Tables.QrToken'a bağlı (bkz. controllers/publicMenuController.js).
router.get('/:qrToken', publicMenuViewLimiter, getPublicMenu);
router.get('/:qrToken/options/:productId', publicMenuViewLimiter, getPublicMenuProductOptions);
router.get('/:qrToken/status', publicMenuViewLimiter, getPublicMenuStatus);
router.post('/:qrToken/order', publicMenuActionLimiter, createCustomerOrderRequest);
router.post('/:qrToken/request', publicMenuActionLimiter, createServiceRequest);

module.exports = router;
