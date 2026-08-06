const express = require('express');
const router = express.Router();
const { publicMenuViewLimiter, publicMenuActionLimiter } = require('../middleware/rateLimiters');
const {
    getPublicMenu,
    getPublicMenuCampaigns,
    getPublicMenuProductOptions,
    createCustomerOrderRequest,
    createServiceRequest,
    getPublicMenuStatus,
    getPublicMenuLoyaltyBalance,
    registerLoyaltyAccount,
    loginLoyaltyAccount,
    createFeedback,
} = require('../controllers/publicMenuController');

// KİMLİK DOĞRULAMASIZ — anonim müşteri QR menüsü. Erişim tamamen
// Tables.QrToken'a bağlı (bkz. controllers/publicMenuController.js).
router.get('/:qrToken', publicMenuViewLimiter, getPublicMenu);
router.get('/:qrToken/campaigns', publicMenuViewLimiter, getPublicMenuCampaigns);
router.get('/:qrToken/options/:productId', publicMenuViewLimiter, getPublicMenuProductOptions);
router.get('/:qrToken/status', publicMenuViewLimiter, getPublicMenuStatus);
router.get('/:qrToken/loyalty/:username', publicMenuViewLimiter, getPublicMenuLoyaltyBalance);
router.post('/:qrToken/loyalty/register', publicMenuActionLimiter, registerLoyaltyAccount);
router.post('/:qrToken/loyalty/login', publicMenuActionLimiter, loginLoyaltyAccount);
router.post('/:qrToken/order', publicMenuActionLimiter, createCustomerOrderRequest);
router.post('/:qrToken/request', publicMenuActionLimiter, createServiceRequest);
router.post('/:qrToken/feedback', publicMenuActionLimiter, createFeedback);

module.exports = router;
