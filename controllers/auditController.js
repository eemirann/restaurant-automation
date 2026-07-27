const { connectDB } = require('../config/db');

// ============================================================
// DENETİM GÜNLÜĞÜNÜ LİSTELE (SADECE ADMIN) — en yeni 200 kayıt
// ============================================================
async function getAuditLog(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT TOP 200 a.AuditLogId, a.UserId, u.FullName AS UserName,
                   a.Action, a.EntityType, a.EntityId, a.Details, a.CreatedAt
            FROM AuditLog a
            LEFT JOIN Users u ON u.UserId = a.UserId
            ORDER BY a.AuditLogId DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Denetim günlüğü getirilirken hata:', err);
        res.status(500).json({ error: 'Denetim günlüğü getirilemedi' });
    }
}

module.exports = { getAuditLog };
