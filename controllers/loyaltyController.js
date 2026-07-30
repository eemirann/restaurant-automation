const { sql, connectDB } = require('../config/db');
const { emitTablesChanged, emitKitchen } = require('../config/socket');
const { deductStockForItem } = require('../utils/stockDeduction');
const { logAudit } = require('../utils/audit');
const { notifyLowStock } = require('../utils/stockAlert');

// ============================================================
// SADAKLIK PUANI — PERSONEL TARAFI
//
// Kullanıcı adı bazlı, kimlik doğrulamasız bir sistem: müşteri kimliği
// sadece checkout'ta girdiği Username'dir (bkz. controllers/
// publicMenuController.js, customerOrderController.js:
// approveCustomerOrderRequest puan kazandırma). Burada personel bir
// müşterinin puan bakiyesini sorgulayıp, LoyaltyPointCost'u olan bir
// ürünü "puanla öde" (ücretsiz) olarak mevcut bir siparişe ekleyebilir.
//
// GÜVENLİK: Puan bakiyesi ve ürünün LoyaltyPointCost'u HER ZAMAN
// sunucuda (bu transaction içinde) yeniden okunur/kontrol edilir —
// client'ın gönderdiği hiçbir puan/uygunluk bilgisi güvenilmez.
// ============================================================

// ============================================================
// GET /api/loyalty — TÜM müşterileri listele (Admin+Cashier).
// Query: ?search=kullaniciadi&sort=points|username|date
// Tables.jsx'teki tek-kullanıcı arama/redeem panelinin YERİNE geçmez —
// bu genel görünürlük/yönetim için ayrı bir Customers.jsx sayfasıdır.
// ============================================================
async function getAllCustomers(req, res) {
    const { search, sort } = req.query;

    try {
        const pool = await connectDB();
        const request = pool.request();

        let where = '';
        if (search && typeof search === 'string' && search.trim()) {
            request.input('Search', sql.NVarChar(50), `%${search.trim()}%`);
            where = 'WHERE Username LIKE @Search';
        }

        const orderBy = sort === 'points' ? 'LoyaltyPoints DESC'
            : sort === 'username' ? 'Username ASC'
            : 'CreatedAt DESC'; // 'date' veya belirtilmemişse: en yeni önce

        const result = await request.query(`
            SELECT CustomerId, Username, LoyaltyPoints, CreatedAt
            FROM Customers
            ${where}
            ORDER BY ${orderBy}
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Müşteriler getirilirken hata:', err);
        res.status(500).json({ error: 'Müşteriler getirilemedi' });
    }
}

// ============================================================
// GET /api/loyalty/:username — bakiye sorgula (bulunamazsa 404,
// personel "bu kullanıcı adında kayıt yok" diyebilsin diye).
// ============================================================
async function getCustomerByUsername(req, res) {
    const { username } = req.params;

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('Username', sql.NVarChar(50), username)
            .query(`SELECT CustomerId, Username, LoyaltyPoints, CreatedAt FROM Customers WHERE Username = @Username`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Bu kullanıcı adında bir müşteri kaydı yok' });
        }
        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Müşteri sadaklık bilgisi getirilirken hata:', err);
        res.status(500).json({ error: 'Müşteri bilgisi getirilemedi' });
    }
}

// ============================================================
// POST /api/loyalty/redeem — puanla bedava ürün ekle.
// Body: { Username, ProductId, OrderId }
// ============================================================
async function redeemLoyaltyProduct(req, res) {
    const { Username, ProductId, OrderId } = req.body || {};

    if (!Username || typeof Username !== 'string' || !Username.trim()) {
        return res.status(400).json({ error: 'Username zorunludur' });
    }
    if (typeof ProductId !== 'number') {
        return res.status(400).json({ error: 'Geçerli bir ProductId zorunludur' });
    }
    if (typeof OrderId !== 'number') {
        return res.status(400).json({ error: 'Geçerli bir OrderId zorunludur' });
    }

    let pool;
    try {
        pool = await connectDB();
    } catch (err) {
        console.error('Veritabanına bağlanılamadı', err);
        return res.status(500).json({ error: 'Veritabanı bağlantı hatası' });
    }

    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const customerResult = await new sql.Request(transaction)
            .input('Username', sql.NVarChar(50), Username.trim())
            .query(`SELECT CustomerId, Username, LoyaltyPoints FROM Customers WITH (UPDLOCK, ROWLOCK) WHERE Username = @Username`);

        if (customerResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Bu kullanıcı adında bir müşteri kaydı yok' });
        }
        const customer = customerResult.recordset[0];

        const productResult = await new sql.Request(transaction)
            .input('ProductId', sql.Int, ProductId)
            .query(`SELECT ProductId, IsActive, IsAvailable, LoyaltyPointCost FROM Products WHERE ProductId = @ProductId`);

        if (productResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        const product = productResult.recordset[0];

        if (product.LoyaltyPointCost === null || product.LoyaltyPointCost === undefined) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Bu ürün puanla alınamaz' });
        }
        if (!product.IsActive) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Ürün şu anda aktif değil' });
        }
        if (!product.IsAvailable) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Ürün şu anda tükendi/satışta değil' });
        }
        if (customer.LoyaltyPoints < product.LoyaltyPointCost) {
            await transaction.rollback();
            return res.status(400).json({ error: `Yetersiz puan (bakiye: ${customer.LoyaltyPoints}, gerekli: ${product.LoyaltyPointCost})` });
        }

        const orderResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, OrderId)
            .query(`SELECT OrderId, TableId, Status FROM Orders WHERE OrderId = @OrderId`);
        if (orderResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }
        const order = orderResult.recordset[0];
        if (['Paid', 'Cancelled', 'Merged'].includes(order.Status)) {
            await transaction.rollback();
            return res.status(400).json({ error: `Bu sipariş '${order.Status}' durumunda, ürün eklenemez.` });
        }

        // Ücretsiz ürün — UnitPrice=0, ama stok/BOM normal düşer (mutfak
        // gerçek bir ürün hazırlıyor, sadece müşteriye ücretsiz).
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, OrderId)
            .input('ProductId', sql.Int, ProductId)
            .query(`INSERT INTO OrderDetails (OrderId, ProductId, Quantity, UnitPrice) VALUES (@OrderId, @ProductId, 1, 0)`);

        const lowStockWarnings = await deductStockForItem(transaction, ProductId, 1);

        await new sql.Request(transaction)
            .input('CustomerId', sql.Int, customer.CustomerId)
            .input('Points', sql.Int, product.LoyaltyPointCost)
            .query(`UPDATE Customers SET LoyaltyPoints = LoyaltyPoints - @Points WHERE CustomerId = @CustomerId`);

        await transaction.commit();
        emitTablesChanged();
        emitKitchen('kds:new', { orderId: OrderId, tableId: order.TableId });
        if (lowStockWarnings.length > 0) notifyLowStock(pool, lowStockWarnings);
        logAudit(pool, {
            userId: req.user?.userId, action: 'LOYALTY_REDEEM', entityType: 'Order', entityId: OrderId,
            details: { username: customer.Username, productId: ProductId, pointsSpent: product.LoyaltyPointCost },
        });

        return res.status(201).json({
            message: 'Ürün puanla eklendi.',
            remainingPoints: customer.LoyaltyPoints - product.LoyaltyPointCost,
            lowStockWarnings,
        });
    } catch (err) {
        try { await transaction.rollback(); } catch { /* rollback best-effort */ }
        console.error('Puanla ürün eklenirken hata:', err);
        return res.status(500).json({ error: 'Ürün puanla eklenemedi' });
    }
}

module.exports = { getAllCustomers, getCustomerByUsername, redeemLoyaltyProduct };
