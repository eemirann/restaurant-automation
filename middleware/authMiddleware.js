const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// ============================================================
// Token doğrulama - tüm korumalı route'larda kullanılır
// Header: Authorization: Bearer <token>
// ============================================================
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token bulunamadı. Giriş yapmalısınız.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId, userName, role }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Oturum süresi doldu, tekrar giriş yapın.' });
        }
        return res.status(401).json({ message: 'Geçersiz token.' });
    }
};

// ============================================================
// Rol kontrolü - verifyToken'dan SONRA kullanılmalı
// Kullanım: requireRole('Manager') veya requireRole('Manager', 'Cashier')
// ============================================================
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Önce giriş yapmalısınız.' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Bu işlem için yetkiniz yok.' });
        }

        next();
    };
};

module.exports = { verifyToken, requireRole };