const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const { getAllCampaigns, createCampaign, updateCampaign, deleteCampaign, uploadCampaignImage } = require('../controllers/campaignController');

// SADECE ADMIN — kampanya/combo yönetimi. Müşteri tarafı (aktif olanlar)
// controllers/publicMenuController.js:getPublicMenuCampaigns üzerinden,
// kimlik doğrulamasız, ayrı bir uçtan (routes/publicMenu.js) sunulur.
router.get('/', verifyToken, requireRole('Admin'), getAllCampaigns);
router.post('/', verifyToken, requireRole('Admin'), createCampaign);
router.put('/:id', verifyToken, requireRole('Admin'), updateCampaign);
router.delete('/:id', verifyToken, requireRole('Admin'), deleteCampaign);
router.post('/:id/image', verifyToken, requireRole('Admin'), upload.single('image'), uploadCampaignImage);

module.exports = router;
