const bcrypt = require('bcryptjs');
const { sql, connectDB } = require('../config/db');

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
            .query(`SELECT UserId FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        await pool.request()
            .input('UserId', sql.Int, id)
            .input('Role', sql.NVarChar(20), Role)
            .query(`UPDATE Users SET Role = @Role WHERE UserId = @UserId`);

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
            .query(`SELECT UserId FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        const passwordHash = await bcrypt.hash(NewPassword, 10);

        await pool.request()
            .input('UserId', sql.Int, id)
            .input('PasswordHash', sql.NVarChar(255), passwordHash)
            .query(`UPDATE Users SET PasswordHash = @PasswordHash WHERE UserId = @UserId`);

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
            .query(`SELECT UserId, IsActive FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        if (!existing.recordset[0].IsActive) {
            return res.status(400).json({ error: 'Bu kullanıcı zaten deaktive edilmiş.' });
        }

        await pool.request()
            .input('UserId', sql.Int, id)
            .query(`UPDATE Users SET IsActive = 0 WHERE UserId = @UserId`);

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
            .query(`SELECT UserId, IsActive FROM Users WHERE UserId = @UserId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
        }

        if (existing.recordset[0].IsActive) {
            return res.status(400).json({ error: 'Bu kullanıcı zaten aktif.' });
        }

        await pool.request()
            .input('UserId', sql.Int, id)
            .query(`UPDATE Users SET IsActive = 1 WHERE UserId = @UserId`);

        return res.status(200).json({ message: 'Kullanıcı tekrar aktifleştirildi.' });
    } catch (err) {
        console.error('Kullanıcı aktifleştirilirken hata:', err);
        return res.status(500).json({ error: 'Kullanıcı aktifleştirilemedi' });
    }
}

module.exports = {
    getAllUsers,
    getUserById,
    updateUserRole,
    resetPassword,
    deactivateUser,
    reactivateUser
};