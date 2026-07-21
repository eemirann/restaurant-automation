const { sql, connectDB } = require('../config/db');

// ============================================================
// REZERVASYON OLUŞTUR (SADECE CASHIER/ADMIN)
// Manuel sistemdir - masa durumu otomatik değişmez, personel ayrıca yönetir
// ============================================================
async function createReservation(req, res) {
    const { TableId, CustomerName, CustomerPhone, PartySize, ReservationTime, Note } = req.body;

    if (!TableId || !CustomerName || !PartySize || !ReservationTime) {
        return res.status(400).json({ error: 'TableId, CustomerName, PartySize ve ReservationTime zorunludur' });
    }

    if (!Number.isInteger(PartySize) || PartySize <= 0) {
        return res.status(400).json({ error: 'PartySize geçerli bir pozitif tam sayı olmalıdır' });
    }

    const parsedDate = new Date(ReservationTime);
    if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'ReservationTime geçerli bir tarih/saat olmalıdır' });
    }

    try {
        const pool = await connectDB();

        // Masa var mı kontrol et
        const tableResult = await pool.request()
            .input('TableId', sql.Int, TableId)
            .query(`SELECT TableId FROM Tables WHERE TableId = @TableId`);

        if (tableResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }

        const result = await pool.request()
            .input('TableId', sql.Int, TableId)
            .input('CustomerName', sql.NVarChar(100), CustomerName)
            .input('CustomerPhone', sql.NVarChar(20), CustomerPhone || null)
            .input('PartySize', sql.Int, PartySize)
            .input('ReservationTime', sql.DateTime2, parsedDate)
            .input('Note', sql.NVarChar(255), Note || null)
            .input('CreatedByUserId', sql.Int, req.user.userId)
            .query(`
                INSERT INTO Reservations (TableId, CustomerName, CustomerPhone, PartySize, ReservationTime, Note, Status, CreatedByUserId, CreatedAt)
                OUTPUT INSERTED.ReservationId, INSERTED.TableId, INSERTED.CustomerName, INSERTED.CustomerPhone,
                       INSERTED.PartySize, INSERTED.ReservationTime, INSERTED.Note, INSERTED.Status, INSERTED.CreatedAt
                VALUES (@TableId, @CustomerName, @CustomerPhone, @PartySize, @ReservationTime, @Note, 'Active', @CreatedByUserId, GETDATE())
            `);

        return res.status(201).json({
            message: 'Rezervasyon oluşturuldu. Masa durumunu ayrıca güncellemeniz gerekir.',
            reservation: result.recordset[0]
        });

    } catch (err) {
        console.error('Rezervasyon oluşturulurken hata:', err);
        return res.status(500).json({ error: 'Rezervasyon oluşturulamadı' });
    }
}

// ============================================================
// REZERVASYON İPTAL ET (SADECE CASHIER/ADMIN)
// ============================================================
async function cancelReservation(req, res) {
    const { id } = req.params;

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('ReservationId', sql.Int, id)
            .query(`SELECT ReservationId, Status FROM Reservations WHERE ReservationId = @ReservationId`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Rezervasyon bulunamadı' });
        }

        if (existing.recordset[0].Status !== 'Active') {
            return res.status(400).json({ error: `Bu rezervasyon zaten '${existing.recordset[0].Status}' durumunda` });
        }

        await pool.request()
            .input('ReservationId', sql.Int, id)
            .query(`UPDATE Reservations SET Status = 'Cancelled' WHERE ReservationId = @ReservationId`);

        return res.status(200).json({ message: 'Rezervasyon iptal edildi.' });

    } catch (err) {
        console.error('Rezervasyon iptal edilirken hata:', err);
        return res.status(500).json({ error: 'Rezervasyon iptal edilemedi' });
    }
}

// ============================================================
// REZERVASYONLARI LİSTELE
// Opsiyonel query parametreleri: ?tableId=&status=
// ============================================================
async function getReservations(req, res) {
    const { tableId, status } = req.query;

    try {
        const pool = await connectDB();
        const request = pool.request();

        let query = `SELECT ReservationId, TableId, CustomerName, CustomerPhone, PartySize, ReservationTime, Note, Status, CreatedByUserId, CreatedAt FROM Reservations WHERE 1=1`;

        if (tableId) {
            request.input('TableId', sql.Int, tableId);
            query += ` AND TableId = @TableId`;
        }

        if (status) {
            request.input('Status', sql.NVarChar(20), status);
            query += ` AND Status = @Status`;
        }

        query += ` ORDER BY ReservationTime ASC`;

        const result = await request.query(query);

        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Rezervasyonlar getirilirken hata:', err);
        return res.status(500).json({ error: 'Rezervasyonlar getirilemedi' });
    }
}

module.exports = { createReservation, cancelReservation, getReservations };