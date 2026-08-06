const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '8h'; // bir vardiya süresi mantıklı bir varsayılan, istersen değiştiririz

const VALID_ROLES = ['Waiter', 'Cashier', 'Admin', 'Kitchen'];

// ============================================================
// KAYIT (REGISTER)
// SADECE ADMIN erişebilir — routes/auth.js'te verifyToken + requireRole('Admin')
// ile korunur, bu endpoint herkese açık DEĞİLDİR.
// ============================================================
const register = async (req, res) => {
    const { FullName, UserName, Password, Role, BranchId } = req.body;

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
            .input('BranchId', sql.Int, BranchId || null)
            .query(`
                INSERT INTO Users (FullName, UserName, PasswordHash, Role, BranchId, IsActive, CreatedAt)
                OUTPUT INSERTED.UserId
                VALUES (@FullName, @UserName, @PasswordHash, @Role, @BranchId, 1, GETDATE())
            `);

        logAudit(pool, {
            userId: req.user?.userId, action: 'USER_CREATE', entityType: 'User', entityId: result.recordset[0].UserId,
            details: { userName: UserName, role: Role },
        });

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
                SELECT UserId, FullName, UserName, PasswordHash, Role, IsActive, BranchId
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
                role: user.Role,
                branchId: user.BranchId ?? null
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        logAudit(pool, { userId: user.UserId, action: 'LOGIN', entityType: 'User', entityId: user.UserId, details: { method: 'password' } });

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

// ============================================================
// PERSONEL LİSTESİ (HERKESE AÇIK)
// PIN giriş ekranındaki personel seçim kartları için — hassas hiçbir alan dönmez.
// ============================================================
const getStaff = async (req, res) => {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT UserId, FullName, Role
            FROM Users
            WHERE IsActive = 1 AND PinHash IS NOT NULL
            ORDER BY FullName ASC
        `);
        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Personel listesi getirilemedi.' });
    }
};

// ============================================================
// PIN İLE GİRİŞ
// ============================================================
const loginWithPin = async (req, res) => {
    const { UserId, Pin } = req.body;

    if (!UserId || !Pin) {
        return res.status(400).json({ message: 'UserId ve Pin zorunludur.' });
    }

    try {
        const pool = await connectDB();

        const result = await pool.request()
            .input('UserId', sql.Int, UserId)
            .query(`
                SELECT UserId, FullName, UserName, PinHash, Role, IsActive, BranchId
                FROM Users
                WHERE UserId = @UserId
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: 'Personel bulunamadı veya PIN hatalı.' });
        }

        const user = result.recordset[0];

        if (!user.IsActive || !user.PinHash) {
            return res.status(401).json({ message: 'Personel bulunamadı veya PIN hatalı.' });
        }

        const pinMatches = await bcrypt.compare(Pin, user.PinHash);
        if (!pinMatches) {
            return res.status(401).json({ message: 'Personel bulunamadı veya PIN hatalı.' });
        }

        const token = jwt.sign(
            { userId: user.UserId, userName: user.UserName, role: user.Role, branchId: user.BranchId ?? null },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        logAudit(pool, { userId: user.UserId, action: 'LOGIN', entityType: 'User', entityId: user.UserId, details: { method: 'pin' } });

        return res.status(200).json({
            message: 'Giriş başarılı.',
            token,
            user: {
                userId: user.UserId,
                fullName: user.FullName,
                userName: user.UserName,
                role: user.Role,
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Giriş yapılırken hata oluştu.', error: err.message });
    }
};

// ============================================================
// ÇIKIŞ (LOGOUT) — token istemcide silinir; burada sadece denetim kaydı tutulur.
// İstemci token'ı silmeden ÖNCE best-effort çağırır.
// ============================================================
const logout = async (req, res) => {
    try {
        const pool = await connectDB();
        logAudit(pool, { userId: req.user?.userId, action: 'LOGOUT', entityType: 'User', entityId: req.user?.userId });
    } catch (e) {
        console.error('Logout audit yazılamadı:', e.message);
    }
    return res.status(200).json({ message: 'Çıkış kaydedildi.' });
};

module.exports = { register, login, getStaff, loginWithPin, logout };