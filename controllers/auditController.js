const { sql, connectDB } = require('../config/db');

// ============================================================
// DENETİM GÜNLÜĞÜNÜ LİSTELE (SADECE ADMIN)
// Opsiyonel ?from=&to= (YYYY-MM-DD, ikisi de saat 00:00-23:59:59.997
// aralığına genişletilir) — verilmezse son 200 kayıt (eski davranış).
// Tarih aralığı verildiğinde üst sınır TOP 1000'e çıkar (belirli bir
// günü/haftayı incelerken 200 kaydın altında kalmak yetersiz olabiliyordu).
// ============================================================
async function getAuditLog(req, res) {
    const { from, to } = req.query;

    try {
        const pool = await connectDB();
        const request = pool.request();

        let query = `
            SELECT TOP ${from || to ? 1000 : 200}
                   a.AuditLogId, a.UserId, u.FullName AS UserName,
                   a.Action, a.EntityType, a.EntityId, a.Details, a.CreatedAt
            FROM AuditLog a
            LEFT JOIN Users u ON u.UserId = a.UserId
            WHERE 1=1
        `;

        if (from) {
            const fromDate = new Date(from);
            if (isNaN(fromDate.getTime())) return res.status(400).json({ error: 'from geçerli bir tarih (YYYY-MM-DD) olmalı' });
            request.input('From', sql.DateTime2, fromDate);
            query += ` AND a.CreatedAt >= @From`;
        }
        if (to) {
            const toDate = new Date(to);
            if (isNaN(toDate.getTime())) return res.status(400).json({ error: 'to geçerli bir tarih (YYYY-MM-DD) olmalı' });
            toDate.setHours(23, 59, 59, 997); // gün sonuna kadar dahil
            request.input('To', sql.DateTime2, toDate);
            query += ` AND a.CreatedAt <= @To`;
        }

        query += ` ORDER BY a.AuditLogId DESC`;

        const result = await request.query(query);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Denetim günlüğü getirilirken hata:', err);
        res.status(500).json({ error: 'Denetim günlüğü getirilemedi' });
    }
}

module.exports = { getAuditLog };
