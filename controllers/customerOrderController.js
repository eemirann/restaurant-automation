const { sql, connectDB } = require('../config/db');
const { emitTablesChanged, emitKitchen } = require('../config/socket');
const { buildOrderInTransaction } = require('../utils/orderBuilder');
const { HttpError } = require('../utils/httpError');
const { logAudit } = require('../utils/audit');

// ============================================================
// MÜŞTERİ QR SİPARİŞ İSTEKLERİ — PERSONEL TARAFI
// Müşterinin gönderdiği istek burada onaylanana kadar gerçek bir
// Orders kaydı YOKTUR (bkz. controllers/publicMenuController.js).
// Onaylandığında fiyat/stok/uygunluk mevcut createOrder ile AYNI
// koddan (buildOrderInTransaction) yeniden ve tam yetkili olarak
// hesaplanır — müşterinin gönderdiği hiçbir veri (özellikle fiyat)
// doğrudan güvenilmez.
// ============================================================

// ============================================================
// GET /api/customer-orders?status=Pending — bekleyen (veya filtreli)
// sipariş isteklerini, kalemleriyle birlikte listeler.
// ============================================================
async function getCustomerOrderRequests(req, res) {
    const { status } = req.query;

    try {
        const pool = await connectDB();
        const request = pool.request();

        let query = `
            SELECT r.CustomerOrderRequestId, r.TableId, t.TableNumber, r.Note, r.Status,
                   r.RejectionReason, r.ApprovedOrderId, r.CreatedAt, r.ResolvedAt
            FROM CustomerOrderRequests r
            JOIN Tables t ON t.TableId = r.TableId
        `;

        if (status) {
            request.input('Status', sql.NVarChar(20), status);
            query += ` WHERE r.Status = @Status`;
        }

        query += ` ORDER BY r.CreatedAt ASC`;

        const requestsResult = await request.query(query);
        const requests = requestsResult.recordset;

        if (requests.length === 0) {
            return res.status(200).json([]);
        }

        const ids = requests.map((r) => r.CustomerOrderRequestId);
        const itemsResult = await pool.request().query(`
            SELECT i.CustomerOrderRequestId, i.ProductId, p.Name AS ProductName,
                   i.Quantity, i.VariantId, i.Note, i.ExtrasJson, i.SyrupsJson
            FROM CustomerOrderRequestItems i
            JOIN Products p ON p.ProductId = i.ProductId
            WHERE i.CustomerOrderRequestId IN (${ids.join(',')})
        `);

        const itemsByRequestId = new Map();
        for (const item of itemsResult.recordset) {
            if (!itemsByRequestId.has(item.CustomerOrderRequestId)) itemsByRequestId.set(item.CustomerOrderRequestId, []);
            itemsByRequestId.get(item.CustomerOrderRequestId).push({
                ...item,
                Extras: item.ExtrasJson ? JSON.parse(item.ExtrasJson) : [],
                Syrups: item.SyrupsJson ? JSON.parse(item.SyrupsJson) : [],
            });
        }

        return res.status(200).json(
            requests.map((r) => ({ ...r, items: itemsByRequestId.get(r.CustomerOrderRequestId) || [] }))
        );
    } catch (err) {
        console.error('Müşteri sipariş istekleri getirilirken hata:', err);
        return res.status(500).json({ error: 'Sipariş istekleri getirilemedi' });
    }
}

// ============================================================
// POST /api/customer-orders/:id/approve — isteği onaylar, GERÇEK
// bir Orders/OrderDetails kaydı oluşturur (mevcut createOrder ile
// birebir aynı fiyat/stok/uygunluk doğrulaması).
// ============================================================
async function approveCustomerOrderRequest(req, res) {
    const { id } = req.params;

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

        const requestResult = await new sql.Request(transaction)
            .input('Id', sql.Int, id)
            .query(`SELECT CustomerOrderRequestId, TableId, Note, Status FROM CustomerOrderRequests WITH (UPDLOCK, ROWLOCK) WHERE CustomerOrderRequestId = @Id`);

        if (requestResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş isteği bulunamadı' });
        }

        const orderRequest = requestResult.recordset[0];

        if (orderRequest.Status !== 'Pending') {
            await transaction.rollback();
            return res.status(400).json({ error: `Bu istek zaten '${orderRequest.Status}' durumunda` });
        }

        const itemsResult = await new sql.Request(transaction)
            .input('RequestId', sql.Int, id)
            .query(`SELECT ProductId, Quantity, VariantId, Note, ExtrasJson, SyrupsJson FROM CustomerOrderRequestItems WHERE CustomerOrderRequestId = @RequestId`);

        const items = itemsResult.recordset.map((item) => ({
            ProductId: item.ProductId,
            Quantity: item.Quantity,
            VariantId: item.VariantId || undefined,
            Note: item.Note || undefined,
            Extras: item.ExtrasJson ? JSON.parse(item.ExtrasJson) : undefined,
            Syrups: item.SyrupsJson ? JSON.parse(item.SyrupsJson) : undefined,
        }));

        const { order, totalAmount, lowStockWarnings } = await buildOrderInTransaction(transaction, {
            TableId: orderRequest.TableId,
            UserId: req.user.userId,
            Items: items,
            Note: orderRequest.Note,
        });

        await new sql.Request(transaction)
            .input('Id', sql.Int, id)
            .input('ApprovedOrderId', sql.Int, order.OrderId)
            .input('ResolvedByUserId', sql.Int, req.user.userId)
            .query(`
                UPDATE CustomerOrderRequests
                SET Status = 'Approved', ApprovedOrderId = @ApprovedOrderId, ResolvedAt = GETDATE(), ResolvedByUserId = @ResolvedByUserId
                WHERE CustomerOrderRequestId = @Id
            `);

        await transaction.commit();
        emitTablesChanged();
        emitKitchen('kds:new', { orderId: order.OrderId, tableId: orderRequest.TableId });
        logAudit(pool, { userId: req.user?.userId, action: 'CUSTOMER_ORDER_APPROVE', entityType: 'CustomerOrderRequest', entityId: Number(id), details: { orderId: order.OrderId, totalAmount } });

        return res.status(201).json({ message: 'Sipariş onaylandı ve oluşturuldu.', order, totalAmount, lowStockWarnings });
    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata:', rollbackErr.message);
        }
        if (err instanceof HttpError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Sipariş isteği onaylanırken hata:', err);
        return res.status(500).json({ error: 'Sipariş isteği onaylanamadı' });
    }
}

// ============================================================
// POST /api/customer-orders/:id/reject — isteği reddeder (Orders'a
// hiç dokunmaz).
// Body: { Reason? }
// ============================================================
async function rejectCustomerOrderRequest(req, res) {
    const { id } = req.params;
    const { Reason } = req.body || {};

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('Id', sql.Int, id)
            .query(`SELECT CustomerOrderRequestId, Status FROM CustomerOrderRequests WHERE CustomerOrderRequestId = @Id`);

        if (existing.recordset.length === 0) {
            return res.status(404).json({ error: 'Sipariş isteği bulunamadı' });
        }

        if (existing.recordset[0].Status !== 'Pending') {
            return res.status(400).json({ error: `Bu istek zaten '${existing.recordset[0].Status}' durumunda` });
        }

        await pool.request()
            .input('Id', sql.Int, id)
            .input('Reason', sql.NVarChar(255), Reason || null)
            .input('ResolvedByUserId', sql.Int, req.user.userId)
            .query(`
                UPDATE CustomerOrderRequests
                SET Status = 'Rejected', RejectionReason = @Reason, ResolvedAt = GETDATE(), ResolvedByUserId = @ResolvedByUserId
                WHERE CustomerOrderRequestId = @Id
            `);

        logAudit(pool, { userId: req.user?.userId, action: 'CUSTOMER_ORDER_REJECT', entityType: 'CustomerOrderRequest', entityId: Number(id), details: { reason: Reason || null } });

        return res.status(200).json({ message: 'Sipariş isteği reddedildi.' });
    } catch (err) {
        console.error('Sipariş isteği reddedilirken hata:', err);
        return res.status(500).json({ error: 'Sipariş isteği reddedilemedi' });
    }
}

module.exports = { getCustomerOrderRequests, approveCustomerOrderRequest, rejectCustomerOrderRequest };
