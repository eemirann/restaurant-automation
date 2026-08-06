const { sql, connectDB } = require('../config/db');

// ============================================================
// ŞUBE LİSTESİ (SADECE OKUMA)
// Şu an için basit bir liste — Users.jsx'teki kullanıcı oluşturma
// formundaki "Şube" dropdown'u için. Şube yönetimi (CRUD arayüzü)
// bu turun kapsamı dışıdır — bkz. migrations/2026_08_12_branches_foundation.sql.
// ============================================================
async function getAllBranches(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT BranchId, Name, Address, IsActive
            FROM Branches
            WHERE IsActive = 1
            ORDER BY Name ASC
        `);
        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Şubeler getirilirken hata:', err);
        return res.status(500).json({ error: 'Şubeler getirilemedi' });
    }
}

module.exports = { getAllBranches };
