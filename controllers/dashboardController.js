const { connectDB } = require('../config/db');

const DAY_NAMES_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']; // JS getDay(): 0 = Pazar

// ============================================================
// Son 7 günü (bugün dahil), veritabanından gelen günlük ciro
// satırlarıyla birleştirip sıfır dolgulu bir dizi olarak döner.
// ============================================================
function buildWeeklyRevenue(rows) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({
            date: d.toISOString().slice(0, 10),
            day: DAY_NAMES_TR[d.getDay()],
            revenue: 0,
        });
    }

    rows.forEach((row) => {
        const dateStr = new Date(row.Day).toISOString().slice(0, 10);
        const match = days.find((d) => d.date === dateStr);
        if (match) match.revenue = Number(row.Revenue) || 0;
    });

    return days;
}

// ============================================================
// DASHBOARD ÖZETİ
// Sayfanın ihtiyaç duyduğu her şeyi tek istekte döner.
// ============================================================
async function getDashboardStats(req, res) {
    try {
        const pool = await connectDB();

        const summaryResult = await pool.request().query(`
            SELECT
                (SELECT ISNULL(SUM(Amount - RefundAmount), 0) FROM Payments
                    WHERE IsDeleted = 0 AND CAST(PaymentDate AS DATE) = CAST(GETDATE() AS DATE)) AS TodayRevenue,
                (SELECT COUNT(*) FROM Orders WHERE CAST(CreatedAt AS DATE) = CAST(GETDATE() AS DATE)) AS TodayOrders,
                (SELECT COUNT(*) FROM Tables WHERE Status = 'Occupied') AS OccupiedTables,
                (SELECT COUNT(*) FROM Tables WHERE Status = 'Empty') AS AvailableTables,
                (SELECT COUNT(*) FROM Stock WHERE Quantity <= MinStockLevel) AS LowStockCount,
                (SELECT COUNT(*) FROM Products WHERE IsRawMaterial = 0) AS TotalProducts
        `);
        const summary = summaryResult.recordset[0];

        const weeklyRevenueResult = await pool.request().query(`
            SELECT CAST(PaymentDate AS DATE) AS Day, SUM(Amount - RefundAmount) AS Revenue
            FROM Payments
            WHERE IsDeleted = 0 AND PaymentDate >= DATEADD(DAY, -6, CAST(GETDATE() AS DATE))
            GROUP BY CAST(PaymentDate AS DATE)
        `);

        const recentOrdersResult = await pool.request().query(`
            SELECT TOP 5 o.OrderId, t.TableNumber, o.TotalAmount, o.Status, o.CreatedAt
            FROM Orders o
            JOIN Tables t ON t.TableId = o.TableId
            ORDER BY o.CreatedAt DESC
        `);

        const lowStockResult = await pool.request().query(`
            SELECT TOP 10 p.Name AS ProductName, s.Quantity, s.MinStockLevel
            FROM Stock s
            JOIN Products p ON p.ProductId = s.ProductId
            WHERE s.Quantity <= s.MinStockLevel
            ORDER BY (s.Quantity - s.MinStockLevel) ASC
        `);

        // Açık masalar — Tables sayfasındaki ile AYNI "gerçek kalan bakiye" mantığı
        // (kısmi ödemeleri düşer); sadece brüt sipariş toplamını göstermek yanıltıcı olurdu.
        const openTablesResult = await pool.request().query(`
            SELECT
                t.TableNumber,
                CASE
                    WHEN (ISNULL(o.TotalAmount, 0) - ISNULL(p.TotalDiscount, 0) - ISNULL(p.NetPaid, 0)) < 0 THEN 0
                    ELSE (ISNULL(o.TotalAmount, 0) - ISNULL(p.TotalDiscount, 0) - ISNULL(p.NetPaid, 0))
                END AS CurrentTotal
            FROM Tables t
            OUTER APPLY (
                SELECT TOP 1 OrderId, TotalAmount
                FROM Orders
                WHERE TableId = t.TableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')
                ORDER BY OrderId DESC
            ) o
            LEFT JOIN (
                SELECT OrderId, SUM(Amount - RefundAmount) AS NetPaid, SUM(DiscountAmount) AS TotalDiscount
                FROM Payments
                WHERE IsDeleted = 0
                GROUP BY OrderId
            ) p ON p.OrderId = o.OrderId
            WHERE t.Status = 'Occupied'
            ORDER BY t.TableNumber ASC
        `);

        const bestSellingResult = await pool.request().query(`
            SELECT TOP 5 p.Name AS ProductName, SUM(od.Quantity) AS QuantitySold
            FROM OrderDetails od
            JOIN Products p ON p.ProductId = od.ProductId
            JOIN Orders o ON o.OrderId = od.OrderId
            WHERE o.Status != 'Cancelled'
            GROUP BY p.Name
            ORDER BY SUM(od.Quantity) DESC
        `);

        res.status(200).json({
            todayRevenue: Number(summary.TodayRevenue) || 0,
            todayOrders: summary.TodayOrders,
            occupiedTables: summary.OccupiedTables,
            availableTables: summary.AvailableTables,
            lowStockCount: summary.LowStockCount,
            totalProducts: summary.TotalProducts,
            weeklyRevenue: buildWeeklyRevenue(weeklyRevenueResult.recordset),
            recentOrders: recentOrdersResult.recordset,
            lowStockProducts: lowStockResult.recordset,
            openTables: openTablesResult.recordset,
            bestSellingProducts: bestSellingResult.recordset,
        });
    } catch (err) {
        console.error('Dashboard verileri getirilirken hata:', err);
        res.status(500).json({ error: 'Dashboard verileri getirilemedi' });
    }
}

module.exports = { getDashboardStats };
