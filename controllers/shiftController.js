const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

// ============================================================
// Beklenen nakit = açılış kasası + vardiya boyunca bu kasiyerin aldığı
// net nakit ödemeler (Amount - RefundAmount, silinmemiş, PaymentMethod='Cash').
// ============================================================
async function computeExpectedCash(pool, userId, openedAt, openingFloat) {
    const res = await pool.request()
        .input('UserId', sql.Int, userId)
        .input('OpenedAt', sql.DateTime, openedAt)
        .query(`
            SELECT ISNULL(SUM(Amount - RefundAmount), 0) AS NetCash
            FROM Payments
            WHERE IsDeleted = 0 AND PaymentMethod = 'Cash'
              AND CreatedBy = @UserId AND PaymentDate >= @OpenedAt
        `);
    const netCash = Number(res.recordset[0].NetCash) || 0;
    return Number(openingFloat) + netCash;
}

// GET /api/shifts/current — bu kullanıcının açık vardiyası (varsa) + canlı beklenen nakit
async function getCurrentShift(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('UserId', sql.Int, req.user.userId)
            .query(`SELECT TOP 1 * FROM Shifts WHERE UserId = @UserId AND Status = 'Open' ORDER BY ShiftId DESC`);

        if (result.recordset.length === 0) return res.status(200).json({ shift: null });

        const shift = result.recordset[0];
        const expectedCash = await computeExpectedCash(pool, shift.UserId, shift.OpenedAt, shift.OpeningFloat);
        return res.status(200).json({ shift: { ...shift, ExpectedCash: expectedCash } });
    } catch (err) {
        console.error('Vardiya getirilirken hata:', err);
        return res.status(500).json({ error: 'Vardiya bilgisi getirilemedi' });
    }
}

// POST /api/shifts/open  body: { OpeningFloat }
async function openShift(req, res) {
    try {
        const { OpeningFloat } = req.body;
        if (OpeningFloat !== undefined && (typeof OpeningFloat !== 'number' || OpeningFloat < 0)) {
            return res.status(400).json({ error: 'Açılış kasası negatif olmayan bir sayı olmalı' });
        }

        const pool = await connectDB();

        const existing = await pool.request()
            .input('UserId', sql.Int, req.user.userId)
            .query(`SELECT ShiftId FROM Shifts WHERE UserId = @UserId AND Status = 'Open'`);

        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Zaten açık bir vardiyanız var. Önce kapatın.' });
        }

        const result = await pool.request()
            .input('UserId', sql.Int, req.user.userId)
            .input('OpeningFloat', sql.Decimal(10, 2), OpeningFloat || 0)
            .query(`INSERT INTO Shifts (UserId, OpeningFloat) OUTPUT INSERTED.* VALUES (@UserId, @OpeningFloat)`);

        logAudit(pool, { userId: req.user?.userId, action: 'SHIFT_OPEN', entityType: 'Shift', entityId: result.recordset[0].ShiftId, details: { OpeningFloat: OpeningFloat || 0 } });
        return res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Vardiya açılırken hata:', err);
        return res.status(500).json({ error: 'Vardiya açılamadı' });
    }
}

// POST /api/shifts/close  body: { CountedCash, Note? }
async function closeShift(req, res) {
    try {
        const { CountedCash, Note } = req.body;
        if (typeof CountedCash !== 'number' || CountedCash < 0) {
            return res.status(400).json({ error: 'Sayılan nakit negatif olmayan bir sayı olmalı' });
        }

        const pool = await connectDB();

        const openRes = await pool.request()
            .input('UserId', sql.Int, req.user.userId)
            .query(`SELECT TOP 1 * FROM Shifts WHERE UserId = @UserId AND Status = 'Open' ORDER BY ShiftId DESC`);

        if (openRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Açık vardiya bulunamadı' });
        }

        const shift = openRes.recordset[0];
        const expectedCash = await computeExpectedCash(pool, shift.UserId, shift.OpenedAt, shift.OpeningFloat);
        const difference = Number(CountedCash) - expectedCash;

        const result = await pool.request()
            .input('ShiftId', sql.Int, shift.ShiftId)
            .input('CountedCash', sql.Decimal(10, 2), CountedCash)
            .input('ExpectedCash', sql.Decimal(10, 2), expectedCash)
            .input('Difference', sql.Decimal(10, 2), difference)
            .input('Note', sql.NVarChar(500), Note || null)
            .query(`
                UPDATE Shifts
                SET Status = 'Closed', ClosedAt = GETDATE(),
                    CountedCash = @CountedCash, ExpectedCash = @ExpectedCash,
                    Difference = @Difference, Note = @Note
                OUTPUT INSERTED.*
                WHERE ShiftId = @ShiftId
            `);

        logAudit(pool, { userId: req.user?.userId, action: 'SHIFT_CLOSE', entityType: 'Shift', entityId: shift.ShiftId, details: { ExpectedCash: expectedCash, CountedCash, Difference: difference } });
        return res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Vardiya kapatılırken hata:', err);
        return res.status(500).json({ error: 'Vardiya kapatılamadı' });
    }
}

// GET /api/shifts — geçmiş vardiyalar (Admin), kullanıcı adıyla
async function listShifts(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT TOP 100 s.*, u.FullName AS UserName
            FROM Shifts s
            JOIN Users u ON u.UserId = s.UserId
            ORDER BY s.ShiftId DESC
        `);
        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Vardiyalar getirilirken hata:', err);
        return res.status(500).json({ error: 'Vardiyalar getirilemedi' });
    }
}

module.exports = { getCurrentShift, openShift, closeShift, listShifts };
