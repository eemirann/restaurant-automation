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
router.get('/', verifyToken, requireRole('Admin'), getAllUsers);
router.get('/:id', verifyToken, requireRole('Admin'), getUserById);
router.patch('/:id/role', verifyToken, requireRole('Admin'), updateUserRole);
router.patch('/:id/reset-password', verifyToken, requireRole('Admin'), resetPassword);
router.patch('/:id/deactivate', verifyToken, requireRole('Admin'), deactivateUser);
router.patch('/:id/reactivate', verifyToken, requireRole('Admin'), reactivateUser);

module.exports = router;