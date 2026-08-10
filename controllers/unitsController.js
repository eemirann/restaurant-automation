const { connectDB } = require('../config/db');

// ============================================================
// BİRİM LİSTESİ (SADECE OKUMA) — Reçete/Ekstra/Şurup formlarındaki birim
// seçim menüleri için (bkz. migrations/2026_08_14_unit_conversion_system.sql).
// Yeni birim eklemek/yönetmek bu turun kapsamı dışı — doğrudan Units
// tablosuna satır eklenerek yapılır (Open/Closed: kod değişmez).
// ============================================================
async function getAllUnits(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT UnitId, Code, Name, UnitType, ConversionFactorToBase
            FROM Units
            WHERE IsActive = 1
            ORDER BY UnitType ASC, Name ASC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Birimler getirilirken hata:', err);
        res.status(500).json({ error: 'Birimler getirilemedi' });
    }
}

module.exports = { getAllUnits };
