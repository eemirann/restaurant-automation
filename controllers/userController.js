const bcrypt = require('bcryptjs');
const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

const VALID_ROLES = ['Waiter', 'Cashier', 'Admin'];

// ============================================================
// TÜM KULLANICILARI LİSTELE (SADECE ADMIN)
// PasswordHash asla dönmez
// ============================================================
async function getAllUsers(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .query(`
                SELECT UserId, FullName, UserName, Role, IsActive, CreatedAt
                FROM Users
                ORDER BY CreatedAt DESC
            `);

        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Kullanıcılar getirilirken hata:', err);
        return res.status(500).json({ error: 'Kullanıcılar getirilemedi' });
    }
}

// ============================================================
// TEK KULLANICI GETİR (SADECE ADMIN)
// ============================================================
async function getUserById(req, res) {
    const { id } = req.params;

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('UserId', sql.Int, id)
            .query(`
                SELECT UserId, FullName, UserName, Role, IsActive, CreatedAt
                FROM Users
                WHERE UserId = @UserId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        return res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Kullanıcı getirilirken hata:', err);
        return res.status(500).json({ error: 'Kullanıcı getirilemedi' });
    }
}

// ============================================================
// ROL DEĞİŞTİR (SADECE ADMIN)
// ============================================================
async function updateUserRole(req, res) {
    const { id } = req.params;
    const { Role } = req.body;

    if (!Role || !VALID_ROLES.includes(Role)) {
        return res.status(400).json({ error: `Role şunlardan biri olmalı: ${VALID_ROLES.join(', ')}` });
    }

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('UserId', sql.Int, id)
            .query(`SELECT UserId, UserName, Role FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        await pool.request()
            .input('UserId', sql.Int, id)
            .input('Role', sql.NVarChar(20), Role)
            .query(`UPDATE Users SET Role = @Role WHERE UserId = @UserId`);

        logAudit(pool, {
            userId: req.user?.userId, action: 'USER_ROLE_CHANGE', entityType: 'User', entityId: Number(id),
            details: { userName: existing.recordset[0].UserName, oldRole: existing.recordset[0].Role, newRole: Role },
        });

        return res.status(200).json({ message: 'Kullanıcı rolü güncellendi.', role: Role });
    } catch (err) {
        console.error('Rol güncellenirken hata:', err);
        return res.status(500).json({ error: 'Rol güncellenemedi' });
    }
}

// ============================================================
// ŞİFRE SIFIRLA (SADECE ADMIN)
// ============================================================
async function resetPassword(req, res) {
    const { id } = req.params;
    const { NewPassword } = req.body;

    if (!NewPassword || NewPassword.length < 6) {
        return res.status(400).json({ error: 'NewPassword en az 6 karakter olmalı' });
    }

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('UserId', sql.Int, id)
            .query(`SELECT UserId, UserName FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const passwordHash = await bcrypt.hash(NewPassword, 10);

        await pool.request()
            .input('UserId', sql.Int, id)
            .input('PasswordHash', sql.NVarChar(255), passwordHash)
            .query(`UPDATE Users SET PasswordHash = @PasswordHash WHERE UserId = @UserId`);

        // Şifrenin kendisi ASLA loglanmaz — sadece "sıfırlandı" bilgisi + kim yaptı + kime.
        logAudit(pool, {
            userId: req.user?.userId, action: 'USER_PASSWORD_RESET', entityType: 'User', entityId: Number(id),
            details: { userName: existing.recordset[0].UserName },
        });

        return res.status(200).json({ message: 'Şifre sıfırlandı.' });
    } catch (err) {
        console.error('Şifre sıfırlanırken hata:', err);
        return res.status(500).json({ error: 'Şifre sıfırlanamadı' });
    }
}

// ============================================================
// KULLANICI DEAKTİVE ET (SADECE ADMIN) - soft, IsActive = 0
// Deaktive edilen kullanıcı login olamaz
// ============================================================
async function deactivateUser(req, res) {
    const { id } = req.params;

    // Admin kendi kendini deaktive edip sistemin dışında kalmasın diye küçük bir koruma
    if (req.user && req.user.userId === Number(id)) {
        return res.status(400).json({ error: 'Kendi hesabınızı deaktive edemezsiniz.' });
    }

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('UserId', sql.Int, id)
            .query(`SELECT UserId, UserName, IsActive FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        if (!existing.recordset[0].IsActive) {
            return res.status(400).json({ error: 'Bu kullanıcı zaten deaktive edilmiş.' });
        }

        await pool.request()
            .input('UserId', sql.Int, id)
            .query(`UPDATE Users SET IsActive = 0 WHERE UserId = @UserId`);

        logAudit(pool, {
            userId: req.user?.userId, action: 'USER_DEACTIVATE', entityType: 'User', entityId: Number(id),
            details: { userName: existing.recordset[0].UserName },
        });

        return res.status(200).json({ message: 'Kullanıcı deaktive edildi.' });
    } catch (err) {
        console.error('Kullanıcı deaktive edilirken hata:', err);
        return res.status(500).json({ error: 'Kullanıcı deaktive edilemedi' });
    }
}

// ============================================================
// KULLANICIYI TEKRAR AKTİFLEŞTİR (SADECE ADMIN)
// ============================================================
async function reactivateUser(req, res) {
    const { id } = req.params;

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('UserId', sql.Int, id)
            .query(`SELECT UserId, UserName, IsActive FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        if (existing.recordset[0].IsActive) {
            return res.status(400).json({ error: 'Bu kullanıcı zaten aktif.' });
        }

        await pool.request()
            .input('UserId', sql.Int, id)
            .query(`UPDATE Users SET IsActive = 1 WHERE UserId = @UserId`);

        logAudit(pool, {
            userId: req.user?.userId, action: 'USER_REACTIVATE', entityType: 'User', entityId: Number(id),
            details: { userName: existing.recordset[0].UserName },
        });

        return res.status(200).json({ message: 'Kullanıcı tekrar aktifleştirildi.' });
    } catch (err) {
        console.error('Kullanıcı aktifleştirilirken hata:', err);
        return res.status(500).json({ error: 'Kullanıcı aktifleştirilemedi' });
    }
}

// ============================================================
// PIN BELİRLE/DEĞİŞTİR (SADECE ADMIN) - login ekranındaki PIN girişi içindir
// ============================================================
async function setPin(req, res) {
    const { id } = req.params;
    const { Pin } = req.body;

    if (!Pin || !/^\d{4}$/.test(Pin)) {
        return res.status(400).json({ error: 'PIN 4 haneli bir sayı olmalı' });
    }

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('UserId', sql.Int, id)
            .query(`SELECT UserId, UserName FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const pinHash = await bcrypt.hash(Pin, 10);

        await pool.request()
            .input('UserId', sql.Int, id)
            .input('PinHash', sql.NVarChar(255), pinHash)
            .query(`UPDATE Users SET PinHash = @PinHash WHERE UserId = @UserId`);

        // PIN'in kendisi ASLA loglanmaz — sadece "değiştirildi" bilgisi + kim yaptı + kime.
        logAudit(pool, {
            userId: req.user?.userId, action: 'USER_PIN_RESET', entityType: 'User', entityId: Number(id),
            details: { userName: existing.recordset[0].UserName },
        });

        return res.status(200).json({ message: 'PIN güncellendi.' });
    } catch (err) {
        console.error('PIN güncellenirken hata:', err);
        return res.status(500).json({ error: 'PIN güncellenemedi' });
    }
}

module.exports = {
    getAllUsers,
    getUserById,
    updateUserRole,
    resetPassword,
    deactivateUser,
    reactivateUser,
    setPin
};