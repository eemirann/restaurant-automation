const jwt = require('jsonwebtoken');
const { sql, connectDB } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;

// ============================================================
// Token doğrulama - tüm korumalı route'larda kullanılır
// Header: Authorization: Bearer <token>
//
// GÜVENLİK: JWT'nin kendisi imza/süre dışında bir şey taşımadığından,
// token geçerli olsa bile kullanıcı DEAKTİVE edilmiş veya rolü
// DEĞİŞTİRİLMİŞ olabilir (bkz. controllers/userController.js
// deactivateUser/updateUserRole). Bu yüzden her istekte Users tablosundan
// güncel IsActive/Role kontrol edilir — deaktive edilen bir çalışan,
// token süresi (8 saat) dolmadan da erişimini kaybeder; rol değişikliği
// de token'ı yeniden almasına gerek kalmadan anında etkili olur.
// ============================================================
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token bulunamadı. Giriş yapmalısınız.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Oturum süresi doldu, tekrar giriş yapın.' });
        }
        return res.status(401).json({ message: 'Geçersiz token.' });
    }

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('UserId', sql.Int, decoded.userId)
            .query('SELECT IsActive, Role FROM Users WHERE UserId = @UserId');

        if (result.recordset.length === 0 || !result.recordset[0].IsActive) {
            return res.status(401).json({ message: 'Hesabınız devre dışı bırakılmış. Yöneticinizle iletişime geçin.' });
        }

        // Rol her istekte DB'den taze okunur — token'daki eski rol yerine
        // güncel rol kullanılır (bkz. updateUserRole).
        const dbRole = result.recordset[0].Role;
        req.user = { ...decoded, role: dbRole != null ? dbRole : decoded.role };
        next();
    } catch (err) {
        console.error('Kullanıcı doğrulanırken hata:', err);
        return res.status(500).json({ message: 'Kimlik doğrulama sırasında hata oluştu.' });
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