const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

// ============================================================
// Beklenen nakit = açılış kasası + vardiya boyunca alınan net nakit ödemeler
// (Amount - RefundAmount, silinmemiş, PaymentMethod='Cash').
//
// Ödemeler ShiftId ile o ANKİ açık vardiyaya sabitlenir (bkz.
// migrations/2026_07_29_payments_shift_id.sql) — bu sayede vardiya bir
// kasiyerden diğerine devredilse (transferShift, Shifts.UserId değişir)
// bile, devir ÖNCESİ kasiyerin topladığı nakit hâlâ bu vardiyaya ait
// sayılır. ShiftId=NULL olan eski (migration öncesi) satırlar için geriye
// dönük uyumluluk amacıyla eski CreatedBy+PaymentDate mantığı da ayrıca
// toplanır (yalnızca ŞU ANKİ sahibi kapsar — devirden önceki eski veri
// için bilinen bir sınırlama, ama migration sonrası tüm ödemeler doğru
// hesaplanır).
// ============================================================
async function computeExpectedCash(pool, shiftId, userId, openedAt, openingFloat) {
    const res = await pool.request()
        .input('ShiftId', sql.Int, shiftId)
        .input('UserId', sql.Int, userId)
        .input('OpenedAt', sql.DateTime, openedAt)
        .query(`
            SELECT ISNULL(SUM(Amount - RefundAmount), 0) AS NetCash
            FROM Payments
            WHERE IsDeleted = 0 AND PaymentMethod = 'Cash'
              AND (
                    ShiftId = @ShiftId
                    OR (ShiftId IS NULL AND CreatedBy = @UserId AND PaymentDate >= @OpenedAt)
                  )
        `);
    const netCash = Number(res.recordset[0].NetCash) || 0;
    return Number(openingFloat) + netCash;
}

// Vardiya canlı metrikleri: toplam satış (tüm yöntemler net), sipariş sayısı, son aktivite.
async function computeShiftMetrics(pool, userId, openedAt) {
    const sales = await pool.request()
        .input('UserId', sql.Int, userId).input('OpenedAt', sql.DateTime, openedAt)
        .query(`SELECT ISNULL(SUM(Amount - RefundAmount), 0) AS Sales FROM Payments
                WHERE IsDeleted = 0 AND CreatedBy = @UserId AND PaymentDate >= @OpenedAt`);
    const orders = await pool.request()
        .input('UserId', sql.Int, userId).input('OpenedAt', sql.DateTime, openedAt)
        .query(`SELECT COUNT(*) AS Orders FROM Orders
                WHERE UserId = @UserId AND Status <> 'Cancelled' AND CreatedAt >= @OpenedAt`);
    const last = await pool.request()
        .input('UserId', sql.Int, userId).input('OpenedAt', sql.DateTime, openedAt)
        .query(`
            SELECT MAX(t) AS LastActivity FROM (
                SELECT MAX(PaymentDate) AS t FROM Payments WHERE CreatedBy = @UserId AND PaymentDate >= @OpenedAt
                UNION ALL
                SELECT MAX(CreatedAt) AS t FROM Orders WHERE UserId = @UserId AND CreatedAt >= @OpenedAt
            ) x`);
    return {
        sales: Number(sales.recordset[0].Sales) || 0,
        orders: orders.recordset[0].Orders || 0,
        lastActivity: last.recordset[0].LastActivity || null,
    };
}

// GET /api/shifts/current — bu kullanıcının açık vardiyası + canlı metrikler
async function getCurrentShift(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('UserId', sql.Int, req.user.userId)
            .query(`SELECT TOP 1 *, DATEDIFF(SECOND, OpenedAt, GETDATE()) AS ElapsedSeconds
                    FROM Shifts WHERE UserId = @UserId AND Status = 'Open' ORDER BY ShiftId DESC`);

        if (result.recordset.length === 0) return res.status(200).json({ shift: null });

        const shift = result.recordset[0];
        const expectedCash = await computeExpectedCash(pool, shift.ShiftId, shift.UserId, shift.OpenedAt, shift.OpeningFloat);
        const metrics = await computeShiftMetrics(pool, shift.UserId, shift.OpenedAt);
        return res.status(200).json({
            shift: { ...shift, ExpectedCash: expectedCash, CurrentSales: metrics.sales, CurrentOrders: metrics.orders, LastActivity: metrics.lastActivity },
        });
    } catch (err) {
        console.error('Vardiya getirilirken hata:', err);
        return res.status(500).json({ error: 'Vardiya bilgisi getirilemedi' });
    }
}

// POST /api/shifts/open  body: { OpeningFloat, OpeningNote? }
async function openShift(req, res) {
    try {
        const { OpeningFloat, OpeningNote } = req.body;
        if (OpeningFloat !== undefined && (typeof OpeningFloat !== 'number' || OpeningFloat < 0)) {
            return res.status(400).json({ error: 'Açılış kasası negatif olmayan bir sayı olmalı' });
        }

        const pool = await connectDB();

        // GÜVENLİK: Kasiyer başına yalnızca TEK açık vardiya.
        const existing = await pool.request()
            .input('UserId', sql.Int, req.user.userId)
            .query(`SELECT ShiftId FROM Shifts WHERE UserId = @UserId AND Status = 'Open'`);

        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Zaten açık bir vardiyanız var. Önce kapatın.' });
        }

        const result = await pool.request()
            .input('UserId', sql.Int, req.user.userId)
            .input('OpeningFloat', sql.Decimal(10, 2), OpeningFloat || 0)
            .input('OpeningNote', sql.NVarChar(500), OpeningNote || null)
            .query(`INSERT INTO Shifts (UserId, OpeningFloat, OpeningNote) OUTPUT INSERTED.* VALUES (@UserId, @OpeningFloat, @OpeningNote)`);

        const shift = result.recordset[0];
        logAudit(pool, { userId: req.user?.userId, action: 'SHIFT_OPEN', entityType: 'Shift', entityId: shift.ShiftId, details: { OpeningFloat: OpeningFloat || 0 } });
        return res.status(201).json(shift);
    } catch (err) {
        console.error('Vardiya açılırken hata:', err);
        return res.status(500).json({ error: 'Vardiya açılamadı' });
    }
}

// POST /api/shifts/open-for  body: { UserId, OpeningFloat, OpeningNote? } (Yönetici)
// Admin, kendi adına değil BAŞKA bir kullanıcı (kasiyer/garson) adına vardiya açar
// (ör. personel unuttuğunda ya da vardiyayı yönetici bizzat başlatmak istediğinde).
async function openShiftFor(req, res) {
    try {
        const { UserId, OpeningFloat, OpeningNote } = req.body;
        if (!UserId) return res.status(400).json({ error: 'UserId zorunludur' });
        if (OpeningFloat !== undefined && (typeof OpeningFloat !== 'number' || OpeningFloat < 0)) {
            return res.status(400).json({ error: 'Açılış kasası negatif olmayan bir sayı olmalı' });
        }

        const pool = await connectDB();

        const targetRes = await pool.request()
            .input('UserId', sql.Int, UserId)
            .query(`SELECT UserId, IsActive FROM Users WHERE UserId = @UserId`);
        if (targetRes.recordset.length === 0 || !targetRes.recordset[0].IsActive) {
            return res.status(400).json({ error: 'Hedef kullanıcı bulunamadı veya aktif değil' });
        }

        const existing = await pool.request()
            .input('UserId', sql.Int, UserId)
            .query(`SELECT ShiftId FROM Shifts WHERE UserId = @UserId AND Status = 'Open'`);
        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Bu kullanıcının zaten açık bir vardiyası var.' });
        }

        const result = await pool.request()
            .input('UserId', sql.Int, UserId)
            .input('OpeningFloat', sql.Decimal(10, 2), OpeningFloat || 0)
            .input('OpeningNote', sql.NVarChar(500), OpeningNote || null)
            .query(`INSERT INTO Shifts (UserId, OpeningFloat, OpeningNote) OUTPUT INSERTED.* VALUES (@UserId, @OpeningFloat, @OpeningNote)`);

        const shift = result.recordset[0];
        logAudit(pool, { userId: req.user?.userId, action: 'SHIFT_OPEN_FOR', entityType: 'Shift', entityId: shift.ShiftId, details: { forUserId: UserId, OpeningFloat: OpeningFloat || 0 } });
        return res.status(201).json(shift);
    } catch (err) {
        console.error('Vardiya (başkası adına) açılırken hata:', err);
        return res.status(500).json({ error: 'Vardiya açılamadı' });
    }
}

// Ortak kapatma yardımcı: bir vardiyayı kapatır, beklenen/fark hesaplar.
async function closeShiftRecord(pool, shift, countedCash, note) {
    const expectedCash = await computeExpectedCash(pool, shift.ShiftId, shift.UserId, shift.OpenedAt, shift.OpeningFloat);
    const counted = typeof countedCash === 'number' ? countedCash : null;
    const difference = counted != null ? counted - expectedCash : null;

    const result = await pool.request()
        .input('ShiftId', sql.Int, shift.ShiftId)
        .input('CountedCash', sql.Decimal(10, 2), counted)
        .input('ExpectedCash', sql.Decimal(10, 2), expectedCash)
        .input('Difference', sql.Decimal(10, 2), difference)
        .input('Note', sql.NVarChar(500), note || null)
        .query(`
            UPDATE Shifts
            SET Status = 'Closed', ClosedAt = GETDATE(),
                CountedCash = @CountedCash, ExpectedCash = @ExpectedCash,
                Difference = @Difference, Note = @Note
            OUTPUT INSERTED.*
            WHERE ShiftId = @ShiftId
        `);
    return { updated: result.recordset[0], expectedCash, difference };
}

// POST /api/shifts/close  body: { CountedCash, Note? } — kendi vardiyasını kapatır
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

        const { updated, expectedCash, difference } = await closeShiftRecord(pool, openRes.recordset[0], CountedCash, Note);
        logAudit(pool, { userId: req.user?.userId, action: 'SHIFT_CLOSE', entityType: 'Shift', entityId: updated.ShiftId, details: { ExpectedCash: expectedCash, CountedCash, Difference: difference } });
        return res.status(200).json(updated);
    } catch (err) {
        console.error('Vardiya kapatılırken hata:', err);
        return res.status(500).json({ error: 'Vardiya kapatılamadı' });
    }
}

// GET /api/shifts/active — açık vardiyalar + metrikler (Yönetici)
async function getActiveShifts(req, res) {
    try {
        const pool = await connectDB();
        const open = (await pool.request().query(`
            SELECT s.*, u.FullName AS UserName, u.Role AS UserRole,
                   DATEDIFF(SECOND, s.OpenedAt, GETDATE()) AS ElapsedSeconds
            FROM Shifts s JOIN Users u ON u.UserId = s.UserId
            WHERE s.Status = 'Open' ORDER BY s.OpenedAt ASC
        `)).recordset;
        const occupied = (await pool.request().query(`SELECT COUNT(*) AS c FROM Tables WHERE Status = 'Occupied'`)).recordset[0].c;

        const out = [];
        for (const s of open) {
            const expectedCash = await computeExpectedCash(pool, s.ShiftId, s.UserId, s.OpenedAt, s.OpeningFloat);
            const m = await computeShiftMetrics(pool, s.UserId, s.OpenedAt);
            out.push({ ...s, ExpectedCash: expectedCash, CurrentSales: m.sales, CurrentOrders: m.orders, LastActivity: m.lastActivity, CurrentTables: occupied });
        }
        return res.status(200).json(out);
    } catch (err) {
        console.error('Aktif vardiyalar getirilirken hata:', err);
        return res.status(500).json({ error: 'Aktif vardiyalar getirilemedi' });
    }
}

// Ortak: id ile açık vardiyayı zorla kapatma (yönetici)
async function forceCloseById(req, res, action) {
    try {
        const { id } = req.params;
        const { CountedCash, Note } = req.body || {};

        const pool = await connectDB();
        const r = (await pool.request().input('Id', sql.Int, id).query(`SELECT * FROM Shifts WHERE ShiftId = @Id`)).recordset;
        if (r.length === 0) return res.status(404).json({ error: 'Vardiya bulunamadı' });
        if (r[0].Status !== 'Open') return res.status(400).json({ error: 'Vardiya zaten kapalı' });

        const { updated, expectedCash, difference } = await closeShiftRecord(pool, r[0], CountedCash, Note);
        logAudit(pool, { userId: req.user?.userId, action, entityType: 'Shift', entityId: updated.ShiftId, details: { cashierUserId: r[0].UserId, ExpectedCash: expectedCash, CountedCash: updated.CountedCash, Difference: difference } });
        return res.status(200).json(updated);
    } catch (err) {
        console.error('Vardiya zorla kapatılırken hata:', err);
        return res.status(500).json({ error: 'İşlem başarısız oldu' });
    }
}

// POST /api/shifts/:id/force-close (Yönetici)
const forceCloseShift = (req, res) => forceCloseById(req, res, 'FORCED_CLOSE');
// POST /api/shifts/:id/force-logout (Yönetici) — vardiyayı kapatır; kasiyer istemcisi
// bir sonraki durum yoklamasında açık vardiyasız kalıp giriş ekranına yönlenir.
const forceLogoutCashier = (req, res) => forceCloseById(req, res, 'FORCED_LOGOUT');

// POST /api/shifts/:id/transfer  body: { ToUserId } (Yönetici)
// Açık vardiyayı başka bir aktif kullanıcıya devreder.
async function transferShift(req, res) {
    try {
        const { id } = req.params;
        const { ToUserId } = req.body || {};
        if (!ToUserId) return res.status(400).json({ error: 'ToUserId zorunludur' });

        const pool = await connectDB();
        const shiftRes = (await pool.request().input('Id', sql.Int, id).query(`SELECT * FROM Shifts WHERE ShiftId = @Id`)).recordset;
        if (shiftRes.length === 0) return res.status(404).json({ error: 'Vardiya bulunamadı' });
        if (shiftRes[0].Status !== 'Open') return res.status(400).json({ error: 'Yalnızca açık vardiya devredilebilir' });

        const targetRes = (await pool.request().input('ToUserId', sql.Int, ToUserId)
            .query(`SELECT UserId, IsActive FROM Users WHERE UserId = @ToUserId`)).recordset;
        if (targetRes.length === 0 || !targetRes[0].IsActive) {
            return res.status(400).json({ error: 'Hedef kullanıcı bulunamadı veya aktif değil' });
        }

        const targetOpen = (await pool.request().input('ToUserId', sql.Int, ToUserId)
            .query(`SELECT ShiftId FROM Shifts WHERE UserId = @ToUserId AND Status = 'Open'`)).recordset;
        if (targetOpen.length > 0) {
            return res.status(409).json({ error: 'Hedef kullanıcının zaten açık bir vardiyası var' });
        }

        const updated = (await pool.request()
            .input('Id', sql.Int, id)
            .input('ToUserId', sql.Int, ToUserId)
            .query(`UPDATE Shifts SET UserId = @ToUserId OUTPUT INSERTED.* WHERE ShiftId = @Id`)).recordset[0];

        logAudit(pool, { userId: req.user?.userId, action: 'SHIFT_TRANSFER', entityType: 'Shift', entityId: Number(id), details: { fromUserId: shiftRes[0].UserId, toUserId: Number(ToUserId) } });
        return res.status(200).json(updated);
    } catch (err) {
        console.error('Vardiya devredilirken hata:', err);
        return res.status(500).json({ error: 'Vardiya devredilemedi' });
    }
}

// GET /api/shifts — geçmiş vardiyalar (Yönetici), kullanıcı adıyla
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

module.exports = {
    getCurrentShift, openShift, openShiftFor, closeShift, listShifts,
    getActiveShifts, forceCloseShift, forceLogoutCashier, transferShift,
};
