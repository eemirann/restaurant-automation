const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, connectDB } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '8h'; // bir vardiya süresi mantıklı bir varsayılan, istersen değiştiririz

const VALID_ROLES = ['Waiter', 'Cashier', 'Admin'];

// ============================================================
// KAYIT (REGISTER)
// ŞİMDİLİK HERKESE AÇIK - ileride sadece Manager erişebilecek
// TODO: Auth tam oturunca bu endpoint'i requireRole('Manager') ile kısıtla
// ============================================================
const register = async (req, res) => {
    const { FullName, UserName, Password, Role } = req.body;

    if (!FullName || !UserName || !Password || !Role) {
        return res.status(400).json({ message: 'FullName, UserName, Password ve Role zorunludur.' });
    }

    if (!VALID_ROLES.includes(Role)) {
        return res.status(400).json({ message: `Role şunlardan biri olmalı: ${VALID_ROLES.join(', ')}` });
    }

    if (Password.length < 6) {
        return res.status(400).json({ message: 'Şifre en az 6 karakter olmalı.' });
    }

    try {
        const pool = await connectDB();

        // Kullanıcı adı zaten alınmış mı kontrol et
        const existing = await pool.request()
            .input('UserName', sql.NVarChar(50), UserName)
            .query(`SELECT UserId FROM Users WHERE UserName = @UserName`);

        if (existing.recordset.length > 0) {
            return res.status(409).json({ message: 'Bu kullanıcı adı zaten kullanılıyor.' });
        }

        const passwordHash = await bcrypt.hash(Password, 10);

        const result = await pool.request()
            .input('FullName', sql.NVarChar(100), FullName)
            .input('UserName', sql.NVarChar(50), UserName)
            .input('PasswordHash', sql.NVarChar(255), passwordHash)
            .input('Role', sql.NVarChar(20), Role)
            .query(`
                INSERT INTO Users (FullName, UserName, PasswordHash, Role, IsActive, CreatedAt)
                OUTPUT INSERTED.UserId
                VALUES (@FullName, @UserName, @PasswordHash, @Role, 1, GETDATE())
            `);

        return res.status(201).json({
            message: 'Kullanıcı oluşturuldu.',
            userId: result.recordset[0].UserId
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Kullanıcı oluşturulurken hata oluştu.', error: err.message });
    }
};

// ============================================================
// GİRİŞ (LOGIN)
// ============================================================
const login = async (req, res) => {
    const { UserName, Password } = req.body;

    if (!UserName || !Password) {
        return res.status(400).json({ message: 'UserName ve Password zorunludur.' });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input('UserName', sql.NVarChar(50), UserName)
            .query(`
                SELECT UserId, FullName, UserName, PasswordHash, Role, IsActive
                FROM Users
                WHERE UserName = @UserName
            `);

        if (result.recordset.length === 0) {
            // Kullanıcı yok mu, şifre yanlış mı -- aynı mesajı dönüyoruz
            // (kullanıcı adı enumeration saldırısına karşı)
            return res.status(401).json({ message: 'Kullanıcı adı veya şifre hatalı.' });
        }

        const user = result.recordset[0];

        if (!user.IsActive) {
            return res.status(403).json({ message: 'Bu hesap devre dışı bırakılmış.' });
        }

        const passwordMatches = await bcrypt.compare(Password, user.PasswordHash);

        if (!passwordMatches) {
            return res.status(401).json({ message: 'Kullanıcı adı veya şifre hatalı.' });
        }

        const token = jwt.sign(
            {
                userId: user.UserId,
                userName: user.UserName,
                role: user.Role
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        return res.status(200).json({
            message: 'Giriş başarılı.',
            token,
            user: {
                userId: user.UserId,
                fullName: user.FullName,
                userName: user.UserName,
                role: user.Role
            }
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Giriş yapılırken hata oluştu.', error: err.message });
    }
};

module.exports = { register, login };