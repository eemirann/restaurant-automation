const { sql, connectDB } = require('../config/db');

// ============================================================
// YARDIMCILAR
// ============================================================

// YYYY-MM-DD formatı doğrulama
function isValidDate(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const d = new Date(str + 'T00:00:00');
    return !isNaN(d.getTime());
}

// Bugünün tarihi (yerel) YYYY-MM-DD
function todayStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

// recordset -> CSV (Excel'in Türkçe karakterleri doğru okuması için BOM ile gönderilir)
function toCSV(rows) {
    if (!rows || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
        lines.push(headers.map((h) => escape(r[h])).join(','));
    }
    return lines.join('\n');
}

function sendCSV(res, filename, rows) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send('﻿' + toCSV(rows));
}

// from/to query parametrelerini çözer; yoksa bugüne düşer. Geçersizse null döner.
function resolveRange(req) {
    const from = req.query.from || todayStr();
    const to = req.query.to || todayStr();
    if (!isValidDate(from) || !isValidDate(to)) return null;
    if (from > to) return null;
    return { from, to };
}

// ============================================================
// SATIŞ RAPORU  (GET /api/reports/sales?from=&to=&format=)
// Tarih aralığında net ciro, ödeme sayısı, sipariş sayısı ve
// ödeme yöntemi kırılımı. Net ciro = SUM(Amount - RefundAmount).
// ============================================================
async function getSalesReport(req, res) {
    try {
        const range = resolveRange(req);
        if (!range) return res.status(400).json({ error: 'Geçersiz tarih aralığı. from/to YYYY-MM-DD olmalı ve from <= to.' });

        const pool = await connectDB();

        const byMethod = await pool.request()
            .input('From', sql.Date, new Date(range.from))
            .input('To', sql.Date, new Date(range.to))
            .query(`
                SELECT PaymentMethod,
                       COUNT(*) AS PaymentCount,
                       ISNULL(SUM(Amount - RefundAmount), 0) AS NetRevenue,
                       ISNULL(SUM(DiscountAmount), 0) AS TotalDiscount,
                       ISNULL(SUM(TipAmount), 0) AS TotalTip,
                       ISNULL(SUM(RefundAmount), 0) AS TotalRefund
                FROM Payments
                WHERE IsDeleted = 0 AND CAST(PaymentDate AS DATE) BETWEEN @From AND @To
                GROUP BY PaymentMethod
                ORDER BY NetRevenue DESC
            `);

        const totals = await pool.request()
            .input('From', sql.Date, new Date(range.from))
            .input('To', sql.Date, new Date(range.to))
            .query(`
                SELECT
                    ISNULL(SUM(Amount - RefundAmount), 0) AS NetRevenue,
                    ISNULL(SUM(DiscountAmount), 0) AS TotalDiscount,
                    ISNULL(SUM(TipAmount), 0) AS TotalTip,
                    ISNULL(SUM(RefundAmount), 0) AS TotalRefund,
                    COUNT(*) AS PaymentCount
                FROM Payments
                WHERE IsDeleted = 0 AND CAST(PaymentDate AS DATE) BETWEEN @From AND @To
            `);

        const orderCount = await pool.request()
            .input('From', sql.Date, new Date(range.from))
            .input('To', sql.Date, new Date(range.to))
            .query(`
                SELECT COUNT(*) AS OrderCount
                FROM Orders
                WHERE Status <> 'Cancelled' AND CAST(CreatedAt AS DATE) BETWEEN @From AND @To
            `);

        if (req.query.format === 'csv') {
            return sendCSV(res, `satis-raporu-${range.from}_${range.to}`, byMethod.recordset);
        }

        res.status(200).json({
            range,
            totals: { ...totals.recordset[0], OrderCount: orderCount.recordset[0].OrderCount },
            byPaymentMethod: byMethod.recordset,
        });
    } catch (err) {
        console.error('Satış raporu getirilirken hata:', err);
        res.status(500).json({ error: 'Satış raporu getirilemedi' });
    }
}

// ============================================================
// GÜN SONU Z-RAPORU  (GET /api/reports/z-report?date=&format=)
// Tek bir gün için özet: net satış, yöntem kırılımı, indirim,
// bahşiş, iade, ödeme ve sipariş sayısı.
// ============================================================
async function getZReport(req, res) {
    try {
        const date = req.query.date || todayStr();
        if (!isValidDate(date)) return res.status(400).json({ error: 'Geçersiz tarih. date YYYY-MM-DD olmalı.' });

        const pool = await connectDB();

        const summary = await pool.request()
            .input('Date', sql.Date, new Date(date))
            .query(`
                SELECT
                    ISNULL(SUM(Amount - RefundAmount), 0) AS NetSales,
                    ISNULL(SUM(CASE WHEN PaymentMethod = 'Cash' THEN Amount - RefundAmount ELSE 0 END), 0) AS Cash,
                    ISNULL(SUM(CASE WHEN PaymentMethod = 'Card' THEN Amount - RefundAmount ELSE 0 END), 0) AS Card,
                    ISNULL(SUM(CASE WHEN PaymentMethod = 'FoodCard' THEN Amount - RefundAmount ELSE 0 END), 0) AS FoodCard,
                    ISNULL(SUM(CASE WHEN PaymentMethod = 'QR' THEN Amount - RefundAmount ELSE 0 END), 0) AS QR,
                    ISNULL(SUM(DiscountAmount), 0) AS TotalDiscount,
                    ISNULL(SUM(TipAmount), 0) AS TotalTip,
                    ISNULL(SUM(RefundAmount), 0) AS TotalRefund,
                    COUNT(*) AS PaymentCount
                FROM Payments
                WHERE IsDeleted = 0 AND CAST(PaymentDate AS DATE) = @Date
            `);

        const orders = await pool.request()
            .input('Date', sql.Date, new Date(date))
            .query(`
                SELECT
                    ISNULL(SUM(CASE WHEN Status <> 'Cancelled' THEN 1 ELSE 0 END), 0) AS OrderCount,
                    ISNULL(SUM(CASE WHEN Status = 'Cancelled' THEN 1 ELSE 0 END), 0) AS CancelledCount
                FROM Orders
                WHERE CAST(CreatedAt AS DATE) = @Date
            `);

        const report = {
            date,
            ...summary.recordset[0],
            OrderCount: orders.recordset[0].OrderCount,
            CancelledCount: orders.recordset[0].CancelledCount,
        };

        if (req.query.format === 'csv') {
            return sendCSV(res, `z-raporu-${date}`, [report]);
        }

        res.status(200).json(report);
    } catch (err) {
        console.error('Z-raporu getirilirken hata:', err);
        res.status(500).json({ error: 'Z-raporu getirilemedi' });
    }
}

// ============================================================
// ÜRÜN SATIŞ & KÂR RAPORU  (GET /api/reports/products?from=&to=&format=)
// Ürün bazında satılan adet, ciro, maliyet ve kâr.
//
// MALİYET KAYNAĞI (öncelik sırasıyla):
//   1) Reçetesi (BOM) olan ürünlerde: SUM(hammadde miktarı * hammadde Cost'u)
//      — reçete/hammadde maliyeti değiştiğinde OTOMATİK güncel kalır, elle
//      Cost girmeye/güncellemeye gerek kalmaz (bkz. RecipeCost alt sorgusu).
//      Reçetedeki hammaddelerden BİRİNİN BİLE Cost'u girilmemişse (NULL),
//      toplam maliyet yanıltıcı olmasın diye NULL döner — kısmi/yanlış bir
//      rakam göstermek, hiç göstermemekten daha kötü.
//   2) Reçetesi olmayan ürünlerde (ör. doğrudan satılan hammadde/şişe içecek):
//      elle girilen Products.Cost.
// Ana ürün maliyeti bilinmiyorsa (1) ve (2) de yoksa Cost/Profit null döner
// (frontend bunu ayrıca işaretler) — bu, ana maliyet sürücüsü olduğu için
// hâlâ katı kurallı.
//
// EKSTRA + ŞURUP MALİYETİ: sipariş kalemine eklenen ekstra/şurupların KENDİ
// Cost'u da (varsa) toplam maliyete eklenir — şurupta porsiyon başına
// gerçek tüketim, Birim Dönüşüm Sistemi (bkz. migrations/2026_08_14_
// unit_conversion_system.sql, dbo.fn_ProductUnitFactor — inline TVF,
// performans için scalar UDF DEĞİL) ile hesaplanır. Bunlar için Cost
// girilmemişse (ana ürünün aksine) tüm hesaplamayı NULL'a düşürmek yerine
// 0 sayılır — ekstra/şurup ana maliyet sürücüsü değil, eksik bilgi ana
// ürünün raporunu tamamen gizlemesin diye.
// ============================================================
async function getProductsReport(req, res) {
    try {
        const range = resolveRange(req);
        if (!range) return res.status(400).json({ error: 'Geçersiz tarih aralığı. from/to YYYY-MM-DD olmalı ve from <= to.' });

        const pool = await connectDB();

        const result = await pool.request()
            .input('From', sql.Date, new Date(range.from))
            .input('To', sql.Date, new Date(range.to))
            .query(`
                DECLARE @PorsiyonUnitId INT = (SELECT UnitId FROM Units WHERE Code = N'porsiyon');
                ;WITH RecipeCost AS (
                    -- r.Quantity * (girilen birim -> hammaddenin stok birimi dönüşüm
                    -- faktörü, bkz. fn_ProductUnitFactor) * hammaddenin stok birimi
                    -- başına maliyeti. r.UnitId NULL ise faktör 1 (eski davranış).
                    SELECT r.ProductId,
                           CASE WHEN COUNT(*) = SUM(CASE WHEN rm.Cost IS NOT NULL THEN 1 ELSE 0 END)
                                THEN SUM(r.Quantity * f.Factor * rm.Cost)
                                ELSE NULL END AS UnitCost
                    FROM Recipes r
                    JOIN Products rm ON rm.ProductId = r.RawMaterialProductId
                    CROSS APPLY dbo.fn_ProductUnitFactor(rm.ProductId, r.UnitId, rm.StockUnitId) f
                    GROUP BY r.ProductId
                ),
                LineExtraCost AS (
                    -- Kalemin 1 adedi için ekstra maliyeti (od.Quantity ile DIŞARIDA
                    -- çarpılır) — ekstranın kendi porsiyon->stok birimi dönüşümü dahil.
                    SELECT ode.OrderDetailsId, SUM(ode.Quantity * f.Factor * ISNULL(ep.Cost, 0)) AS UnitCost
                    FROM OrderDetailExtras ode
                    JOIN Products ep ON ep.ProductId = ode.ExtraProductId
                    CROSS APPLY dbo.fn_ProductUnitFactor(ep.ProductId, @PorsiyonUnitId, ep.StockUnitId) f
                    GROUP BY ode.OrderDetailsId
                ),
                LineSyrupCost AS (
                    -- Kalemin 1 adedi için şurup maliyeti: porsiyon * (porsiyon->stok birimi
                    -- dönüşüm faktörü) * stok birimi başına maliyet (bkz. fn_ProductUnitFactor)
                    SELECT ods.OrderDetailsId, SUM(ods.Quantity * f.Factor * ISNULL(sp.Cost, 0)) AS UnitCost
                    FROM OrderDetailSyrups ods
                    JOIN Products sp ON sp.ProductId = ods.SyrupProductId
                    CROSS APPLY dbo.fn_ProductUnitFactor(sp.ProductId, @PorsiyonUnitId, sp.StockUnitId) f
                    GROUP BY ods.OrderDetailsId
                )
                SELECT
                    p.ProductId,
                    p.Name AS ProductName,
                    SUM(od.Quantity) AS QuantitySold,
                    SUM(od.Quantity * od.UnitPrice) AS Revenue,
                    CASE WHEN COALESCE(rc.UnitCost, p.Cost) IS NULL THEN NULL
                         ELSE SUM(od.Quantity * (COALESCE(rc.UnitCost, p.Cost) + ISNULL(lec.UnitCost, 0) + ISNULL(lsc.UnitCost, 0))) END AS Cost,
                    CASE WHEN COALESCE(rc.UnitCost, p.Cost) IS NULL THEN NULL
                         ELSE SUM(od.Quantity * od.UnitPrice) - SUM(od.Quantity * (COALESCE(rc.UnitCost, p.Cost) + ISNULL(lec.UnitCost, 0) + ISNULL(lsc.UnitCost, 0))) END AS Profit
                FROM OrderDetails od
                JOIN Orders o ON o.OrderId = od.OrderId
                JOIN Products p ON p.ProductId = od.ProductId
                LEFT JOIN RecipeCost rc ON rc.ProductId = p.ProductId
                LEFT JOIN LineExtraCost lec ON lec.OrderDetailsId = od.OrderDetailsId
                LEFT JOIN LineSyrupCost lsc ON lsc.OrderDetailsId = od.OrderDetailsId
                WHERE o.Status <> 'Cancelled'
                  AND CAST(o.CreatedAt AS DATE) BETWEEN @From AND @To
                GROUP BY p.ProductId, p.Name, p.Cost, rc.UnitCost
                ORDER BY Revenue DESC
            `);

        if (req.query.format === 'csv') {
            return sendCSV(res, `urun-raporu-${range.from}_${range.to}`, result.recordset);
        }

        res.status(200).json({ range, products: result.recordset });
    } catch (err) {
        console.error('Ürün raporu getirilirken hata:', err);
        res.status(500).json({ error: 'Ürün raporu getirilemedi' });
    }
}

// ============================================================
// PERSONEL PERFORMANS RAPORU  (GET /api/reports/staff-performance?from=&to=&format=)
// Siparişi AÇAN personel (Orders.UserId) bazında sipariş sayısı, ciro,
// ortalama sepet tutarı ve en çok sattığı ürün.
//
// ÖNEMLİ: Users'a IsActive filtresi UYGULANMAZ — pasife alınmış bir
// personelin geçmiş performansı da görünmelidir. Sorgu Orders'tan
// sürüldüğü için sadece tarih aralığında işlem yapmış kullanıcılar döner.
// ============================================================
async function getStaffPerformanceReport(req, res) {
    try {
        const range = resolveRange(req);
        if (!range) return res.status(400).json({ error: 'Geçersiz tarih aralığı. from/to YYYY-MM-DD olmalı ve from <= to.' });

        const pool = await connectDB();

        const result = await pool.request()
            .input('From', sql.Date, new Date(range.from))
            .input('To', sql.Date, new Date(range.to))
            .query(`
                WITH StaffOrders AS (
                    SELECT o.UserId,
                           COUNT(*) AS OrderCount,
                           ISNULL(SUM(o.TotalAmount), 0) AS Revenue
                    FROM Orders o
                    WHERE o.Status <> 'Cancelled'
                      AND o.UserId IS NOT NULL
                      AND CAST(o.CreatedAt AS DATE) BETWEEN @From AND @To
                    GROUP BY o.UserId
                ),
                StaffTopProduct AS (
                    SELECT UserId, ProductName, QuantitySold,
                           ROW_NUMBER() OVER (PARTITION BY UserId ORDER BY QuantitySold DESC, ProductName ASC) AS Rn
                    FROM (
                        SELECT o.UserId, p.Name AS ProductName, SUM(od.Quantity) AS QuantitySold
                        FROM OrderDetails od
                        JOIN Orders o ON o.OrderId = od.OrderId
                        JOIN Products p ON p.ProductId = od.ProductId
                        WHERE o.Status <> 'Cancelled'
                          AND o.UserId IS NOT NULL
                          AND CAST(o.CreatedAt AS DATE) BETWEEN @From AND @To
                        GROUP BY o.UserId, p.Name
                    ) AS PerUserProduct
                )
                SELECT
                    u.UserId,
                    u.FullName,
                    u.UserName,
                    u.Role,
                    u.IsActive,
                    so.OrderCount,
                    so.Revenue,
                    CASE WHEN so.OrderCount = 0 THEN 0
                         ELSE CAST(so.Revenue AS DECIMAL(18,2)) / so.OrderCount END AS AvgBasket,
                    tp.ProductName AS TopProductName,
                    tp.QuantitySold AS TopProductQuantity
                FROM StaffOrders so
                JOIN Users u ON u.UserId = so.UserId
                LEFT JOIN StaffTopProduct tp ON tp.UserId = so.UserId AND tp.Rn = 1
                ORDER BY so.Revenue DESC
            `);

        if (req.query.format === 'csv') {
            return sendCSV(res, `personel-performans-${range.from}_${range.to}`, result.recordset);
        }

        res.status(200).json({ range, staff: result.recordset });
    } catch (err) {
        console.error('Personel performans raporu getirilirken hata:', err);
        res.status(500).json({ error: 'Personel performans raporu getirilemedi' });
    }
}

module.exports = { getSalesReport, getZReport, getProductsReport, getStaffPerformanceReport };
