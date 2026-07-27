const { sql } = require('../config/db');

// ============================================================
// Denetim günlüğü yazıcı — BEST-EFFORT: audit yazımı asıl işlemi
// asla bozmaz/patlatmaz (hata olursa sadece loglar).
// Açık transaction'ı kirletmemek için ayrı pool.request() kullanır;
// bu yüzden ilgili aksiyon COMMIT edildikten SONRA çağrılmalıdır.
//   logAudit(pool, { userId, action, entityType, entityId, details })
// ============================================================
async function logAudit(pool, { userId = null, action, entityType = null, entityId = null, details = null }) {
    try {
        const detailsStr = details == null ? null : (typeof details === 'string' ? details : JSON.stringify(details));
        await pool.request()
            .input('UserId', sql.Int, userId ?? null)
            .input('Action', sql.NVarChar(50), action)
            .input('EntityType', sql.NVarChar(50), entityType)
            .input('EntityId', sql.Int, entityId ?? null)
            .input('Details', sql.NVarChar(sql.MAX), detailsStr)
            .query(`INSERT INTO AuditLog (UserId, Action, EntityType, EntityId, Details)
                    VALUES (@UserId, @Action, @EntityType, @EntityId, @Details)`);
    } catch (e) {
        console.error('Audit log yazılamadı:', e.message);
    }
}

module.exports = { logAudit };
