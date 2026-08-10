const { sql, connectDB } = require('../config/db');
const { emitTablesChanged, emitKitchen } = require('../config/socket');
const { recalculateOrderStatus } = require('./paymentController');
const { deductStockForItem, restoreStockForItem, isRecipeLinked } = require('../utils/stockDeduction');
const { notifyLowStock } = require('../utils/stockAlert');
const { logAudit } = require('../utils/audit');
const { attachOrderItemOptions } = require('../utils/orderItemOptions');
const { buildOrderInTransaction, addItemsToOrderInTransaction } = require('../utils/orderBuilder');
const { HttpError } = require('../utils/httpError');
const { toStockUnit, getPorsiyonUnitId } = require('../utils/unitConversion');

// ============================================================
// SİPARİŞ OLUŞTUR
// GÜVENLİK: UnitPrice client'tan ASLA kabul edilmez.
// Fiyat sunucuda Products.Price (+ ProductVariants.Price varsa) üzerinden hesaplanır.
// ============================================================
async function createOrder(req, res) {
    const { TableId, UserId, Items, Note, Combos } = req.body;

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

        const { order, totalAmount, lowStockWarnings } = await buildOrderInTransaction(transaction, { TableId, UserId, Items, Note, Combos });

        await transaction.commit();
        emitTablesChanged();
        emitKitchen('kds:new', { orderId: order.OrderId, tableId: TableId });
        if (lowStockWarnings.length > 0) notifyLowStock(pool, lowStockWarnings);

        res.status(201).json({
            message: 'Sipariş başarıyla oluşturuldu.',
            order,
            totalAmount,
            lowStockWarnings
        });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata (muhtemelen zaten abort olmuş):', rollbackErr.message);
        }
        if (err instanceof HttpError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Sipariş oluşturulurken asıl hata:', err);
        res.status(500).json({ error: 'Sipariş oluşturulamadı' });
    }
}

// ============================================================
// TÜM SİPARİŞLERİ LİSTELE
// Opsiyonel query parametresi: ?status=Pending gibi filtre için
// ============================================================
async function getAllOrders(req, res) {
    const { status } = req.query;

    try {
        const pool = await connectDB();
        const request = pool.request();

        let query = `SELECT OrderId, TableId, UserId, Status, TotalAmount, Note, CreatedAt FROM Orders`;

        if (status) {
            request.input('Status', sql.NVarChar(50), status);
            query += ` WHERE Status = @Status`;
        }

        query += ` ORDER BY CreatedAt DESC`;

        const result = await request.query(query);

        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Siparişler getirilirken hata:', err);
        return res.status(500).json({ error: 'Siparişler getirilemedi' });
    }
}

// ============================================================
// TEK SİPARİŞİ DETAYIYLA GETİR (ürünleri dahil)
// ============================================================
async function getOrderById(req, res) {
    const { id } = req.params;

    try {
        const pool = await connectDB();

        const orderResult = await pool.request()
            .input('OrderId', sql.Int, id)
            .query(`SELECT OrderId, TableId, UserId, Status, TotalAmount, Note, CreatedAt, TipAmount FROM Orders WHERE OrderId = @OrderId`);

        if (orderResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const detailsResult = await pool.request()
            .input('OrderId', sql.Int, id)
            .query(`SELECT OrderDetailsId, ProductId, Quantity, UnitPrice, VariantId, Note FROM OrderDetails WHERE OrderId = @OrderId`);

        const itemsWithOptions = await attachOrderItemOptions(pool, id, detailsResult.recordset);

        return res.status(200).json({
            ...orderResult.recordset[0],
            items: itemsWithOptions
        });
    } catch (err) {
        console.error('Sipariş getirilirken hata:', err);
        return res.status(500).json({ error: 'Sipariş getirilemedi' });
    }
}

// ============================================================
// SİPARİŞ İPTAL ET (SADECE ADMIN)
// Status = 'Cancelled' yapılır, düşülen stok geri eklenir
// ============================================================
async function cancelOrder(req, res) {
    const { id } = req.params;
    // Opsiyonel iptal sebebi (Toast'taki "Void Order" akışındaki sebep
    // seçimiyle aynı amaç) — sadece audit'e yazılır, iş mantığını etkilemez.
    const Reason = typeof req.body?.Reason === 'string' ? req.body.Reason.trim().slice(0, 500) : null;

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

        const orderResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .query(`SELECT TableId, Status FROM Orders WHERE OrderId = @OrderId`);

        if (orderResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const { TableId, Status } = orderResult.recordset[0];

        if (Status === 'Cancelled') {
            await transaction.rollback();
            return res.status(400).json({ error: 'Bu sipariş zaten iptal edilmiş' });
        }

        // Ödenmiş bir sipariş doğrudan iptal edilemez — aksi halde stok geri
        // eklenir ama Payments tablosuna hiç dokunulmadığı için o ödeme
        // ciro/rapor/vardiya kasa hesaplarında "gerçek" gibi sayılmaya devam
        // eder (bkz. POST /api/payments/:id/refund, controllers/paymentController.js).
        if (Status === 'Paid') {
            await transaction.rollback();
            return res.status(400).json({ error: 'Ödenmiş bir sipariş doğrudan iptal edilemez. Önce ödemeyi iade edin (POST /api/payments/:id/refund).' });
        }

        const detailsResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .query(`SELECT OrderDetailsId, ProductId, Quantity FROM OrderDetails WHERE OrderId = @OrderId`);

        for (const item of detailsResult.recordset) {
            // Reçetesi varsa hammaddeler, yoksa ürünün kendisi geri eklenir (BOM-farkında)
            await restoreStockForItem(transaction, item.ProductId, item.Quantity);

            const extrasResult = await new sql.Request(transaction)
                .input('OrderDetailsId', sql.Int, item.OrderDetailsId)
                .query(`SELECT ExtraProductId, Quantity FROM OrderDetailExtras WHERE OrderDetailsId = @OrderDetailsId`);

            const porsiyonUnitIdForCancel = await getPorsiyonUnitId(transaction);
            for (const extra of extrasResult.recordset) {
                const extraFactor = await toStockUnit(transaction, extra.ExtraProductId, 1, porsiyonUnitIdForCancel);
                await restoreStockForItem(transaction, extra.ExtraProductId, extra.Quantity * item.Quantity * extraFactor);
            }

            const syrupsResult = await new sql.Request(transaction)
                .input('OrderDetailsId', sql.Int, item.OrderDetailsId)
                .query(`SELECT SyrupProductId, Quantity FROM OrderDetailSyrups WHERE OrderDetailsId = @OrderDetailsId`);

            const porsiyonUnitId = await getPorsiyonUnitId(transaction);
            for (const syrup of syrupsResult.recordset) {
                // Reçeteye bağlıysa hiç düşülmemişti (bkz. utils/orderBuilder.js) — geri de eklenmez.
                const linked = await isRecipeLinked(transaction, item.ProductId, syrup.SyrupProductId);
                const stockUnitsPerServing = linked ? 0 : await toStockUnit(transaction, syrup.SyrupProductId, 1, porsiyonUnitId);
                await restoreStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * item.Quantity * stockUnitsPerServing);
            }
        }

        await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderId = @OrderId`);

        // İptal edilen bu siparişten başka aktif sipariş kalmadıysa masa boşalır
        // (Orders trigger'ı sadece 'Paid' geçişinde boşaltıyor, 'Cancelled' için karşılığı yok).
        const remainingActive = await new sql.Request(transaction)
            .input('TableId', sql.Int, TableId)
            .query(`SELECT OrderId FROM Orders WHERE TableId = @TableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')`);

        if (remainingActive.recordset.length === 0) {
            await new sql.Request(transaction)
                .input('TableId', sql.Int, TableId)
                .query(`UPDATE Tables SET Status = 'Empty' WHERE TableId = @TableId`);
        }

        await transaction.commit();
        emitTablesChanged();
        logAudit(pool, { userId: req.user?.userId, action: 'ORDER_CANCEL', entityType: 'Order', entityId: Number(id), details: { TableId, Reason: Reason || null } });

        return res.status(200).json({ message: 'Sipariş iptal edildi, stok geri eklendi.' });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata (muhtemelen zaten abort olmuş):', rollbackErr.message);
        }
        console.error('Sipariş iptal edilirken hata:', err);
        return res.status(500).json({ error: 'Sipariş iptal edilemedi' });
    }
}

// ============================================================
// SİPARİŞ DURUMUNU GÜNCELLE (sadece Pending <-> Served)
// NOT: 'Cancelled' için /:id/cancel, 'Paid' için ödeme akışı
// (/api/payments) kullanılır. Bu endpoint sadece mutfak/servis
// akışını yönetir, o yüzden sadece Pending/Served kabul eder.
// ============================================================
async function updateOrderStatus(req, res) {
    const { id } = req.params;
    const { Status } = req.body;

    const ALLOWED_STATUSES = ['Pending', 'Served'];

    if (!Status || !ALLOWED_STATUSES.includes(Status)) {
        return res.status(400).json({
            error: `Status şunlardan biri olmalı: ${ALLOWED_STATUSES.join(', ')}. İptal için /:id/cancel, ödeme için /api/payments kullanın.`
        });
    }

    try {
        const pool = await connectDB();

        const currentResult = await pool.request()
            .input('OrderId', sql.Int, id)
            .query(`SELECT Status FROM Orders WHERE OrderId = @OrderId`);

        if (currentResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const currentStatus = currentResult.recordset[0].Status;

        if (['Paid', 'Cancelled', 'Merged'].includes(currentStatus)) {
            return res.status(400).json({ error: `Bu sipariş '${currentStatus}' durumunda, servis durumu değiştirilemez` });
        }

        const result = await pool.request()
            .input('OrderId', sql.Int, id)
            .input('Status', sql.NVarChar(50), Status)
            .query(`UPDATE Orders SET Status = @Status WHERE OrderId = @OrderId`);

        const updated = await pool.request()
            .input('OrderId', sql.Int, id)
            .query(`SELECT * FROM Orders WHERE OrderId = @OrderId`);

        emitTablesChanged();
        logAudit(pool, { userId: req.user?.userId, action: 'ORDER_STATUS_CHANGE', entityType: 'Order', entityId: Number(id), details: { from: currentStatus, to: Status } });
        return res.status(200).json(updated.recordset[0]);
    } catch (err) {
        console.error('Sipariş durumu güncellenirken hata:', err);
        return res.status(500).json({ error: 'Sipariş durumu güncellenemedi' });
    }
}

// ============================================================
// MEVCUT SİPARİŞE ÜRÜN EKLE
// Sadece Pending/Served durumundaki siparişlere eklenebilir
// (Paid/Cancelled/Merged sipariş zaten getTableById'de activeOrder olarak dönmez).
// ============================================================
async function addOrderItems(req, res) {
    const { id } = req.params;
    const { Items } = req.body;

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

        // Fiyat/stok çözümleme + OrderDetails ekleme mantığı artık paylaşılan
        // bir fonksiyonda (bkz. utils/orderBuilder.js -> addItemsToOrderInTransaction) —
        // müşteri QR siparişi onaylanırken masada açık sipariş varsa AYNI kod
        // kullanılıyor (bkz. controllers/customerOrderController.js).
        const { addedAmount, lowStockWarnings } = await addItemsToOrderInTransaction(transaction, id, Items);

        await transaction.commit();
        emitTablesChanged();
        emitKitchen('kds:new', { orderId: Number(id) });
        logAudit(pool, {
            userId: req.user?.userId, action: 'ORDER_ITEM_ADD', entityType: 'Order', entityId: Number(id),
            details: { items: (Items || []).map((i) => ({ ProductId: i.ProductId, Quantity: i.Quantity })), addedAmount },
        });

        const updated = await pool.request()
            .input('OrderId', sql.Int, id)
            .query(`SELECT * FROM Orders WHERE OrderId = @OrderId`);

        return res.status(200).json({
            message: 'Ürünler siparişe eklendi.',
            order: updated.recordset[0],
            addedAmount,
            lowStockWarnings
        });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata:', rollbackErr.message);
        }
        if (err instanceof HttpError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Siparişe ürün eklenirken hata:', err);
        return res.status(500).json({ error: 'Ürünler eklenemedi' });
    }
}

// ============================================================
// SİPARİŞTEN ÜRÜN KALEMİNİ TAMAMEN ÇIKAR
// Sadece Pending/Served durumundaki siparişlerde yapılabilir.
// Düşülen stok geri eklenir, TotalAmount yeniden hesaplanır.
// ============================================================
async function removeOrderItem(req, res) {
    const { id, itemId } = req.params;

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

        const orderResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .query(`SELECT OrderId, Status, TotalAmount FROM Orders WHERE OrderId = @OrderId`);

        if (orderResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const order = orderResult.recordset[0];
        if (['Paid', 'Cancelled', 'Merged'].includes(order.Status)) {
            await transaction.rollback();
            return res.status(400).json({ error: `Bu sipariş '${order.Status}' durumunda, ürün çıkarılamaz.` });
        }

        const itemResult = await new sql.Request(transaction)
            .input('OrderDetailsId', sql.Int, itemId)
            .input('OrderId', sql.Int, id)
            .query(`SELECT OrderDetailsId, ProductId, Quantity, UnitPrice FROM OrderDetails
                    WHERE OrderDetailsId = @OrderDetailsId AND OrderId = @OrderId`);

        if (itemResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş kalemi bulunamadı' });
        }

        const item = itemResult.recordset[0];

        const extrasResult = await new sql.Request(transaction)
            .input('OrderDetailsId', sql.Int, itemId)
            .query(`SELECT ExtraProductId, Quantity FROM OrderDetailExtras WHERE OrderDetailsId = @OrderDetailsId`);

        const syrupsResult = await new sql.Request(transaction)
            .input('OrderDetailsId', sql.Int, itemId)
            .query(`SELECT SyrupProductId, Quantity FROM OrderDetailSyrups WHERE OrderDetailsId = @OrderDetailsId`);

        // Bu kalemden kalem-bazlı (ürün ürün) ödemeyle zaten para tahsil edilmişse
        // silinemez — hem PaymentItems'daki FK buna zaten izin vermez, hem de
        // tahsil edilmiş parayı sahipsiz bırakmamak için iş kuralı olarak engellenir.
        const paidResult = await new sql.Request(transaction)
            .input('OrderDetailsId', sql.Int, itemId)
            .query(`
                SELECT ISNULL(SUM(pi.Quantity), 0) AS PaidQuantity
                FROM PaymentItems pi
                JOIN Payments p ON p.PaymentsId = pi.PaymentsId
                WHERE pi.OrderDetailsId = @OrderDetailsId AND p.IsDeleted = 0 AND p.RefundAmount < p.Amount
            `);

        if (paidResult.recordset[0].PaidQuantity > 0) {
            await transaction.rollback();
            return res.status(400).json({ error: `Bu üründen ${paidResult.recordset[0].PaidQuantity} adet zaten ödendi, silinemez. Önce iade edin.` });
        }

        // OrderDetailExtras/OrderDetailSyrups satırları ON DELETE CASCADE ile birlikte silinir
        await new sql.Request(transaction)
            .input('OrderDetailsId', sql.Int, itemId)
            .query(`DELETE FROM OrderDetails WHERE OrderDetailsId = @OrderDetailsId`);

        // Reçetesi varsa hammaddeler, yoksa ürünün kendisi geri eklenir (BOM-farkında)
        await restoreStockForItem(transaction, item.ProductId, item.Quantity);

        const porsiyonUnitIdForRemoval = await getPorsiyonUnitId(transaction);
        for (const extra of extrasResult.recordset) {
            const extraFactor = await toStockUnit(transaction, extra.ExtraProductId, 1, porsiyonUnitIdForRemoval);
            await restoreStockForItem(transaction, extra.ExtraProductId, extra.Quantity * item.Quantity * extraFactor);
        }

        for (const syrup of syrupsResult.recordset) {
            // Reçeteye bağlıysa hiç düşülmemişti (bkz. utils/orderBuilder.js) — geri de eklenmez.
            const linked = await isRecipeLinked(transaction, item.ProductId, syrup.SyrupProductId);
            const stockUnitsPerServing = linked ? 0 : await toStockUnit(transaction, syrup.SyrupProductId, 1, porsiyonUnitIdForRemoval);
            await restoreStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * item.Quantity * stockUnitsPerServing);
        }

        const newTotal = Math.max(Number(order.TotalAmount) - Number(item.UnitPrice) * item.Quantity, 0);

        await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .input('TotalAmount', sql.Decimal(10, 2), newTotal)
            .query(`UPDATE Orders SET TotalAmount = @TotalAmount WHERE OrderId = @OrderId`);

        // Toplam düştüğü için daha önce yapılmış kısmi ödeme artık siparişi tam
        // karşılıyor olabilir — bu durumda Status='Paid' + masa boşaltma tetiklenir.
        await recalculateOrderStatus(transaction, id);

        await transaction.commit();
        emitTablesChanged();
        logAudit(pool, {
            userId: req.user?.userId, action: 'ORDER_ITEM_REMOVE', entityType: 'Order', entityId: Number(id),
            details: { ProductId: item.ProductId, Quantity: item.Quantity },
        });

        const updated = await pool.request()
            .input('OrderId', sql.Int, id)
            .query(`SELECT * FROM Orders WHERE OrderId = @OrderId`);

        return res.status(200).json({ message: 'Ürün siparişten çıkarıldı.', order: updated.recordset[0] });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata:', rollbackErr.message);
        }
        console.error('Sipariş kalemi çıkarılırken hata:', err);
        return res.status(500).json({ error: 'Ürün çıkarılamadı' });
    }
}

// ============================================================
// SİPARİŞTEKİ BİR ÜRÜN KALEMİNİN ADEDİNİ GÜNCELLE
// Body: { Quantity } (>= 1 tam sayı olmalı; 0/negatif için DELETE kullanılır)
// Stok farkı kadar düşülür/geri eklenir, TotalAmount yeniden hesaplanır.
// ============================================================
async function updateOrderItemQuantity(req, res) {
    const { id, itemId } = req.params;
    const { Quantity } = req.body;

    if (!Number.isInteger(Quantity) || Quantity < 1) {
        return res.status(400).json({ error: 'Quantity 1 veya daha büyük bir tam sayı olmalıdır. Kaldırmak için DELETE kullanın.' });
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

        const orderResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .query(`SELECT OrderId, Status, TotalAmount FROM Orders WHERE OrderId = @OrderId`);

        if (orderResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const order = orderResult.recordset[0];
        if (['Paid', 'Cancelled', 'Merged'].includes(order.Status)) {
            await transaction.rollback();
            return res.status(400).json({ error: `Bu sipariş '${order.Status}' durumunda, adet güncellenemez.` });
        }

        const itemResult = await new sql.Request(transaction)
            .input('OrderDetailsId', sql.Int, itemId)
            .input('OrderId', sql.Int, id)
            .query(`SELECT OrderDetailsId, ProductId, Quantity, UnitPrice FROM OrderDetails
                    WHERE OrderDetailsId = @OrderDetailsId AND OrderId = @OrderId`);

        if (itemResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş kalemi bulunamadı' });
        }

        const item = itemResult.recordset[0];
        const diff = Quantity - item.Quantity;

        // Adet AZALTMA (diff < 0) SADECE Cashier/Admin — Garson bir kalemi
        // mutfağa/kasaya bildirildikten sonra kendi başına düşüremez (suistimal/
        // yanlışlıkla azaltma riski). Artırma (yeni ürün ekleme etkisiyle aynı)
        // Garson'a hâlâ açık.
        if (diff < 0 && req.user?.role === 'Waiter') {
            await transaction.rollback();
            return res.status(403).json({ error: 'Adet azaltma yetkiniz yok. Kasiyer veya yöneticiye başvurun.' });
        }

        // Yeni adet, kalem-bazlı ödemeyle zaten tahsil edilmiş adedin altına düşemez
        // (aksi halde RemainingQuantity negatif olur, kalan adet backend'de tutarsızlaşır).
        const paidResult = await new sql.Request(transaction)
            .input('OrderDetailsId', sql.Int, itemId)
            .query(`
                SELECT ISNULL(SUM(pi.Quantity), 0) AS PaidQuantity
                FROM PaymentItems pi
                JOIN Payments p ON p.PaymentsId = pi.PaymentsId
                WHERE pi.OrderDetailsId = @OrderDetailsId AND p.IsDeleted = 0 AND p.RefundAmount < p.Amount
            `);

        const paidQuantity = paidResult.recordset[0].PaidQuantity;
        if (Quantity < paidQuantity) {
            await transaction.rollback();
            return res.status(400).json({ error: `Bu üründen ${paidQuantity} adet zaten ödendi, adet bunun altına düşürülemez.` });
        }

        // Adet arttıysa fark kadar düş, azaldıysa fark kadar geri ekle (BOM-farkında)
        if (diff > 0) {
            await deductStockForItem(transaction, item.ProductId, diff);
        } else if (diff < 0) {
            await restoreStockForItem(transaction, item.ProductId, -diff);
        }

        // Kaleme bağlı ekstralar/şuruplar da adet başına düşürüldüğü için aynı farkla ölçeklenir
        if (diff !== 0) {
            const extrasResult = await new sql.Request(transaction)
                .input('OrderDetailsId', sql.Int, itemId)
                .query(`SELECT ExtraProductId, Quantity FROM OrderDetailExtras WHERE OrderDetailsId = @OrderDetailsId`);

            const porsiyonUnitIdForUpdateExtra = await getPorsiyonUnitId(transaction);
            for (const extra of extrasResult.recordset) {
                const extraFactor = await toStockUnit(transaction, extra.ExtraProductId, 1, porsiyonUnitIdForUpdateExtra);
                if (diff > 0) {
                    await deductStockForItem(transaction, extra.ExtraProductId, extra.Quantity * diff * extraFactor);
                } else {
                    await restoreStockForItem(transaction, extra.ExtraProductId, extra.Quantity * -diff * extraFactor);
                }
            }

            const syrupsResult = await new sql.Request(transaction)
                .input('OrderDetailsId', sql.Int, itemId)
                .query(`SELECT SyrupProductId, Quantity FROM OrderDetailSyrups WHERE OrderDetailsId = @OrderDetailsId`);

            const porsiyonUnitIdForUpdate = await getPorsiyonUnitId(transaction);
            for (const syrup of syrupsResult.recordset) {
                // Reçeteye bağlıysa hiç düşülmemişti (bkz. utils/orderBuilder.js) — artış/azalışta da etkilenmez.
                const linked = await isRecipeLinked(transaction, item.ProductId, syrup.SyrupProductId);
                const stockUnitsPerServing = linked ? 0 : await toStockUnit(transaction, syrup.SyrupProductId, 1, porsiyonUnitIdForUpdate);
                if (diff > 0) {
                    await deductStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * diff * stockUnitsPerServing);
                } else {
                    await restoreStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * -diff * stockUnitsPerServing);
                }
            }
        }

        await new sql.Request(transaction)
            .input('OrderDetailsId', sql.Int, itemId)
            .input('Quantity', sql.Int, Quantity)
            .query(`UPDATE OrderDetails SET Quantity = @Quantity WHERE OrderDetailsId = @OrderDetailsId`);

        const newTotal = Math.max(Number(order.TotalAmount) + Number(item.UnitPrice) * diff, 0);

        await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .input('TotalAmount', sql.Decimal(10, 2), newTotal)
            .query(`UPDATE Orders SET TotalAmount = @TotalAmount WHERE OrderId = @OrderId`);

        // Adet azaltıldıysa (diff < 0) toplam düşer ve daha önceki kısmi ödeme
        // artık siparişi tam karşılıyor olabilir — bu yüzden her durumda kontrol edilir.
        await recalculateOrderStatus(transaction, id);

        await transaction.commit();
        emitTablesChanged();
        logAudit(pool, {
            userId: req.user?.userId, action: 'ORDER_ITEM_QTY_CHANGE', entityType: 'Order', entityId: Number(id),
            details: { ProductId: item.ProductId, from: item.Quantity, to: Quantity },
        });

        const updated = await pool.request()
            .input('OrderId', sql.Int, id)
            .query(`SELECT * FROM Orders WHERE OrderId = @OrderId`);

        return res.status(200).json({ message: 'Adet güncellendi.', order: updated.recordset[0] });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata:', rollbackErr.message);
        }
        console.error('Sipariş kalemi adedi güncellenirken hata:', err);
        return res.status(500).json({ error: 'Adet güncellenemedi' });
    }
}

// ============================================================
// SİPARİŞ ZAMAN ÇİZELGESİ — bu siparişe (EntityType='Order', EntityId=id)
// ait tüm AuditLog kayıtlarını kronolojik sırayla döner (kim/ne zaman/ne
// yaptı). Yeni tablo AÇILMADI — mevcut AuditLog (bkz. utils/audit.js,
// controllers/auditController.js) zaten bu amaca uygun; sadece OrderId'ye
// göre filtrelenmiş bir okuma. tableController.js'teki TABLE_TRANSFER
// audit'i de aynı EntityType/EntityId'yi kullandığından, masa
// transfer/birleştirme olayları da otomatik olarak bu listede çıkar.
// ============================================================
async function getOrderHistory(req, res) {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('OrderId', sql.Int, id)
            .query(`
                SELECT a.AuditLogId, a.UserId, u.FullName AS UserName, a.Action, a.Details, a.CreatedAt
                FROM AuditLog a
                LEFT JOIN Users u ON u.UserId = a.UserId
                WHERE a.EntityType = 'Order' AND a.EntityId = @OrderId
                ORDER BY a.AuditLogId ASC
            `);
        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Sipariş geçmişi getirilirken hata:', err);
        return res.status(500).json({ error: 'Sipariş geçmişi getirilemedi' });
    }
}

module.exports = {
    createOrder,
    getAllOrders,
    getOrderById,
    cancelOrder,
    updateOrderStatus,
    addOrderItems,
    removeOrderItem,
    updateOrderItemQuantity,
    getOrderHistory
};