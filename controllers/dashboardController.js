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
// Bugün için 08:00-23:00 arası saatlik ciro dizisi (henüz gelmemiş
// saatler 0 görünür — gün ilerledikçe dolar).
// ============================================================
function buildHourlyRevenue(rows) {
    const hours = [];
    for (let h = 8; h <= 23; h++) {
        hours.push({ hour: `${String(h).padStart(2, '0')}:00`, revenue: 0 });
    }
    rows.forEach((row) => {
        const match = hours.find((h) => h.hour === `${String(row.Hour).padStart(2, '0')}:00`);
        if (match) match.revenue = Number(row.Revenue) || 0;
    });
    return hours;
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

        // Bugün satılan ürünlerin kategoriye göre ciro dağılımı.
        const categoryRevenueResult = await pool.request().query(`
            SELECT c.Name AS CategoryName, SUM(od.Quantity * od.UnitPrice) AS Revenue
            FROM OrderDetails od
            JOIN Orders o ON o.OrderId = od.OrderId
            JOIN Products p ON p.ProductId = od.ProductId
            JOIN Categories c ON c.CategoryId = p.CategoryId
            WHERE CAST(o.CreatedAt AS DATE) = CAST(GETDATE() AS DATE) AND o.Status != 'Cancelled'
            GROUP BY c.Name
            HAVING SUM(od.Quantity * od.UnitPrice) > 0
            ORDER BY Revenue DESC
        `);
        const categoryRevenueTotal = categoryRevenueResult.recordset.reduce((sum, r) => sum + Number(r.Revenue), 0);
        const categoryDistribution = categoryRevenueResult.recordset.map((r) => ({
            category: r.CategoryName,
            revenue: Number(r.Revenue),
            percent: categoryRevenueTotal > 0 ? Math.round((Number(r.Revenue) / categoryRevenueTotal) * 100) : 0,
        }));

        // Bugünkü kâr oranı — sadece Cost'u girilmiş ürünler üzerinden (girilmemişse
        // yanıltıcı bir oran vermek yerine ayrı say, frontend uyarı gösterebilsin).
        const profitResult = await pool.request().query(`
            SELECT
                ISNULL(SUM(CASE WHEN p.Cost IS NOT NULL THEN od.Quantity * od.UnitPrice ELSE 0 END), 0) AS PricedRevenue,
                ISNULL(SUM(CASE WHEN p.Cost IS NOT NULL THEN od.Quantity * p.Cost ELSE 0 END), 0) AS PricedCost,
                ISNULL(SUM(CASE WHEN p.Cost IS NULL THEN od.Quantity ELSE 0 END), 0) AS UnpricedQuantity
            FROM OrderDetails od
            JOIN Orders o ON o.OrderId = od.OrderId
            JOIN Products p ON p.ProductId = od.ProductId
            WHERE CAST(o.CreatedAt AS DATE) = CAST(GETDATE() AS DATE) AND o.Status != 'Cancelled'
        `);
        const profitRow = profitResult.recordset[0];
        const pricedRevenue = Number(profitRow.PricedRevenue) || 0;
        const pricedCost = Number(profitRow.PricedCost) || 0;
        const profitRatio = {
            revenue: pricedRevenue,
            cost: pricedCost,
            net: pricedRevenue - pricedCost,
            percent: pricedRevenue > 0 ? Math.round(((pricedRevenue - pricedCost) / pricedRevenue) * 100) : null,
            hasUnpricedItems: Number(profitRow.UnpricedQuantity) > 0,
        };

        // Bugünün 08:00-23:00 aralığındaki saatlik ciro dağılımı.
        const hourlyRevenueResult = await pool.request().query(`
            SELECT DATEPART(HOUR, PaymentDate) AS Hour, SUM(Amount - RefundAmount) AS Revenue
            FROM Payments
            WHERE IsDeleted = 0 AND CAST(PaymentDate AS DATE) = CAST(GETDATE() AS DATE)
            GROUP BY DATEPART(HOUR, PaymentDate)
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
            categoryDistribution,
            profitRatio,
            hourlyRevenue: buildHourlyRevenue(hourlyRevenueResult.recordset),
        });
    } catch (err) {
        console.error('Dashboard verileri getirilirken hata:', err);
        res.status(500).json({ error: 'Dashboard verileri getirilemedi' });
    }
}

module.exports = { getDashboardStats };
