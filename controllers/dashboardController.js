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
                (SELECT COUNT(*) FROM Products WHERE IsRawMaterial = 0 AND IsExtra = 0 AND IsSyrup = 0) AS TotalProducts,
                (SELECT COUNT(*) FROM Orders WHERE CAST(CreatedAt AS DATE) = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE)) AS YesterdayOrders,
                (SELECT COUNT(DISTINCT TableId) FROM Orders
                    WHERE CAST(CreatedAt AS DATE) = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE) AND Status != 'Cancelled') AS YesterdayOccupiedTables
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

        // NOT: bestSellingProducts/categoryDistribution/profitRatio SİPARİŞ bazlı
        // (OrderDetails, Status<>'Cancelled') hesaplanır — henüz ÖDENMEMİŞ ama
        // servis edilmiş siparişleri de içerir. TodayRevenue/weeklyRevenue/
        // hourlyRevenue ise NAKİT/tahsilat bazlı (Payments, RefundAmount düşülmüş)
        // hesaplanır. İkisi kasıtlı olarak farklı yöntemler — toplamları
        // birbirine denk gelmeyebilir, karşılaştırılmamalı (frontend'de "sipariş
        // bazlı" etiketiyle ayrıştırılır, bkz. Dashboard.jsx).
        //
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

        // En çok satılan combo — bestSellingResult ile aynı desen, ama
        // OrderDetails.ComboOfferId üzerinden ComboOffers'a bağlanır.
        const bestSellingCombosResult = await pool.request().query(`
            SELECT TOP 5 co.Name AS ComboName, SUM(od.Quantity) AS QuantitySold
            FROM OrderDetails od
            JOIN ComboOffers co ON co.ComboOfferId = od.ComboOfferId
            JOIN Orders o ON o.OrderId = od.OrderId
            WHERE od.ComboOfferId IS NOT NULL AND o.Status != 'Cancelled'
            GROUP BY co.Name
            ORDER BY SUM(od.Quantity) DESC
        `);

        // Sadaklık — kaç farklı kullanıcı adı puan biriktirmiş (Customers
        // Username'de zaten UNIQUE, bkz. migrations/2026_08_01_campaigns_and_loyalty.sql).
        const loyaltyCustomerCountResult = await pool.request().query(`
            SELECT COUNT(*) AS LoyaltyCustomerCount FROM Customers
        `);

        // Toplam harcanan puan / verilen ücretsiz ürün sayısı — Products.LoyaltyPointCost
        // dolu olan ürünlerin UnitPrice=0 yazılmış satırları (bkz. controllers/
        // loyaltyController.js redeemLoyaltyProduct, her zaman Quantity=1 ekler).
        const loyaltyRedeemResult = await pool.request().query(`
            SELECT
                ISNULL(COUNT(*), 0) AS FreeProductCount,
                ISNULL(SUM(p.LoyaltyPointCost * od.Quantity), 0) AS TotalPointsSpent
            FROM OrderDetails od
            JOIN Products p ON p.ProductId = od.ProductId
            JOIN Orders o ON o.OrderId = od.OrderId
            WHERE od.UnitPrice = 0 AND p.LoyaltyPointCost IS NOT NULL AND o.Status != 'Cancelled'
        `);
        const loyaltyRedeemRow = loyaltyRedeemResult.recordset[0];

        // Anket — ortalama Lezzet/Hizmet/Temizlik puanı (1-3 arası, bkz.
        // migrations/2026_08_04_recurrence_tips_feedback.sql).
        const feedbackResult = await pool.request().query(`
            SELECT
                AVG(CAST(TasteRating AS FLOAT)) AS AvgTaste,
                AVG(CAST(ServiceRating AS FLOAT)) AS AvgService,
                AVG(CAST(CleanlinessRating AS FLOAT)) AS AvgCleanliness,
                COUNT(*) AS FeedbackCount
            FROM Feedback
        `);
        const feedbackRow = feedbackResult.recordset[0];

        res.status(200).json({
            todayRevenue: Number(summary.TodayRevenue) || 0,
            todayOrders: summary.TodayOrders,
            occupiedTables: summary.OccupiedTables,
            availableTables: summary.AvailableTables,
            lowStockCount: summary.LowStockCount,
            totalProducts: summary.TotalProducts,
            yesterdayOrders: Number(summary.YesterdayOrders) || 0,
            yesterdayOccupiedTables: Number(summary.YesterdayOccupiedTables) || 0,
            weeklyRevenue: buildWeeklyRevenue(weeklyRevenueResult.recordset),
            recentOrders: recentOrdersResult.recordset,
            lowStockProducts: lowStockResult.recordset,
            openTables: openTablesResult.recordset,
            bestSellingProducts: bestSellingResult.recordset,
            categoryDistribution,
            profitRatio,
            hourlyRevenue: buildHourlyRevenue(hourlyRevenueResult.recordset),
            bestSellingCombos: bestSellingCombosResult.recordset,
            loyaltyCustomerCount: loyaltyCustomerCountResult.recordset[0].LoyaltyCustomerCount,
            loyaltyRedeem: {
                freeProductCount: Number(loyaltyRedeemRow.FreeProductCount) || 0,
                totalPointsSpent: Number(loyaltyRedeemRow.TotalPointsSpent) || 0,
            },
            feedback: {
                avgTaste: feedbackRow.AvgTaste !== null ? Number(feedbackRow.AvgTaste) : null,
                avgService: feedbackRow.AvgService !== null ? Number(feedbackRow.AvgService) : null,
                avgCleanliness: feedbackRow.AvgCleanliness !== null ? Number(feedbackRow.AvgCleanliness) : null,
                count: feedbackRow.FeedbackCount,
            },
        });
    } catch (err) {
        console.error('Dashboard verileri getirilirken hata:', err);
        res.status(500).json({ error: 'Dashboard verileri getirilemedi' });
    }
}

module.exports = { getDashboardStats };
