const express = require('express');
const router = express.Router();
const {
    getAllUsers,
    getUserById,
    updateUserRole,
    resetPassword,
    deactivateUser,
    reactivateUser
} = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// TÜM ENDPOINT'LER SADECE ADMIN
router.get('/', verifyToken, getAllUsers);
router.get('/:id', verifyToken, getUserById);
router.patch('/:id/role', verifyToken, updateUserRole);
router.patch('/:id/reset-password', verifyToken, resetPassword);
router.patch('/:id/deactivate', verifyToken, deactivateUser);
router.patch('/:id/reactivate', verifyToken, reactivateUser);

module.exports = router;