const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { getServiceRequests, resolveServiceRequest } = require('../controllers/serviceRequestController');

// Giriş yapmış herkes (Garson/Kasiyer/Admin) görebilir/çözümleyebilir.
router.get('/', verifyToken, getServiceRequests);
router.patch('/:id/resolve', verifyToken, resolveServiceRequest);

module.exports = router;
