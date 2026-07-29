const { sql, connectDB } = require('../config/db');

// ============================================================
// HIZLI HİZMET İSTEKLERİ (garson çağır / hesap / su / peçete /
// çatal-bıçak) — PERSONEL TARAFI. Oluşturma tarafı için bkz.
// controllers/publicMenuController.js (anonim, müşteri tarafı).
// ============================================================

// ============================================================
// GET /api/service-requests?status=Pending — istekleri masa
// bilgisiyle birlikte listeler.
// ============================================================
async function getServiceRequests(req, res) {
    const { status } = req.query;

    try {
        const pool = await connectDB();
        const request = pool.request();

        let query = `
            SELECT sr.ServiceRequestId, sr.TableId, t.TableNumber, sr.Type, sr.Status, sr.CreatedAt, sr.ResolvedAt
            FROM ServiceRequests sr
            JOIN Tables t ON t.TableId = sr.TableId
        `;

        if (status) {
            request.input('Status', sql.NVarChar(20), status);
            query += ` WHERE sr.Status = @Status`;
        }

        query += ` ORDER BY sr.CreatedAt ASC`;

        const result = await request.query(query);
        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Hizmet istekleri getirilirken hata:', err);
        return res.status(500).json({ error: 'Hizmet istekleri getirilemedi' });
    }
}

// ============================================================
// PATCH /api/service-requests/:id/resolve — isteği "hallettim" olarak işaretler.
// ============================================================
async function resolveServiceRequest(req, res) {
    const { id } = req.params;

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('Id', sql.Int, id)
            .query(`SELECT ServiceRequestId, Status FROM ServiceRequests WHERE ServiceRequestId = @Id`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'İstek bulunamadı' });
        }

        if (existing.recordset[0].Status !== 'Pending') {
            return res.status(400).json({ error: 'Bu istek zaten çözümlenmiş' });
        }

        await pool.request()
            .input('Id', sql.Int, id)
            .input('ResolvedByUserId', sql.Int, req.user.userId)
            .query(`
                UPDATE ServiceRequests
                SET Status = 'Resolved', ResolvedAt = GETDATE(), ResolvedByUserId = @ResolvedByUserId
                WHERE ServiceRequestId = @Id
            `);

        return res.status(200).json({ message: 'İstek çözümlendi olarak işaretlendi.' });
    } catch (err) {
        console.error('Hizmet isteği çözümlenirken hata:', err);
        return res.status(500).json({ error: 'İstek çözümlenemedi' });
    }
}

module.exports = { getServiceRequests, resolveServiceRequest };
