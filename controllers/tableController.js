const { sql, connectDB } = require('../config/db');
const { emitTablesChanged } = require('../config/socket');
const { logAudit } = require('../utils/audit');
const { attachOrderItemOptions } = require('../utils/orderItemOptions');

// Geçerli masa bölgeleri artık sabit değil — admin tarafından yönetilen
// TableAreas tablosundan (bkz. controllers/tableAreaController.js) okunur.
async function isActiveArea(pool, name) {
    const result = await pool.request()
        .input('Name', sql.NVarChar(20), name)
        .query(`SELECT AreaId FROM TableAreas WHERE Name = @Name AND IsActive = 1`);
    return result.recordset.length > 0;
}

// ============================================================
// TÜM MASALARI LİSTELE
// Opsiyonel query parametresi: ?status=Empty gibi filtre için
// Aktif siparişin (varsa) toplam tutarı ve ürün adedi de dahil edilir
// (masa kartında anlık tutar/adet göstermek için).
// ============================================================
async function getAllTables(req, res) {
    const { status } = req.query;

    try {
        const pool = await connectDB();
        const request = pool.request();

        // OUTER APPLY + TOP 1 kullanılıyor: bir masada (normalde olmaması gereken ama
        // eski/test verisinde rastlanabilen) birden fazla aktif sipariş bulunsa bile
        // her masa için tam olarak tek satır döner (en güncel siparişi baz alır).
        // CurrentTotal = siparişin toplamı - indirim - (varsa) o ana kadar yapılmış kısmi
        // ödemeler; sadece brüt sipariş toplamını göstermek, kısmi/ürün bazlı ödeme
        // yapıldığında kart üzerindeki tutarın hiç değişmemiş gibi görünmesine yol açıyordu.
        let query = `
            SELECT
                t.TableId, t.TableNumber, t.Capacity, t.Status, t.Area,
                o.OrderId AS ActiveOrderId,
                o.CreatedAt AS OrderCreatedAt,
                o.Status AS OrderStatus,
                u.FullName AS WaiterName,
                CASE
                    WHEN (ISNULL(o.TotalAmount, 0) - ISNULL(p.TotalDiscount, 0) - ISNULL(p.NetPaid, 0)) < 0 THEN 0
                    ELSE (ISNULL(o.TotalAmount, 0) - ISNULL(p.TotalDiscount, 0) - ISNULL(p.NetPaid, 0))
                END AS CurrentTotal,
                ISNULL(od.ItemCount, 0) AS ItemCount
            FROM Tables t
            OUTER APPLY (
                SELECT TOP 1 OrderId, TotalAmount, CreatedAt, UserId, Status
                FROM Orders
                WHERE TableId = t.TableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')
                ORDER BY OrderId DESC
            ) o
            LEFT JOIN Users u ON u.UserId = o.UserId
            LEFT JOIN (
                SELECT OrderId, SUM(Quantity) AS ItemCount
                FROM OrderDetails
                GROUP BY OrderId
            ) od ON od.OrderId = o.OrderId
            LEFT JOIN (
                SELECT OrderId, SUM(Amount - RefundAmount) AS NetPaid, SUM(DiscountAmount) AS TotalDiscount
                FROM Payments
                WHERE IsDeleted = 0
                GROUP BY OrderId
            ) p ON p.OrderId = o.OrderId
        `;

        // Şube filtresi: Admin'in JWT'sinde branchId NULL bırakılabilir
        // ("tüm şubeleri gör"), Waiter/Cashier için her zaman dolu olmalı —
        // bkz. migrations/2026_08_12_branches_foundation.sql.
        const conditions = [];
        if (status) {
            request.input('Status', sql.NVarChar(20), status);
            conditions.push('t.Status = @Status');
        }
        if (req.user?.branchId != null) {
            request.input('BranchId', sql.Int, req.user.branchId);
            conditions.push('(t.BranchId = @BranchId OR t.BranchId IS NULL)');
        }
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY t.TableNumber ASC`;

        const result = await request.query(query);

        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Masalar getirilirken hata:', err);
        return res.status(500).json({ error: 'Masalar getirilemedi' });
    }
}

// ============================================================
// MASA TRANSFERİ / BİRLEŞTİRME (MOVE / MERGE)
// Herkes yapabilir (Waiter/Cashier/Admin) - toggle ile kısıtlanabilir (ileride)
//
// Body: { OrderId, ToTableId, TransferType: 'Move' | 'Merge', Reason }
// Params: tableId -> kaynak masa (FromTableId), Order'ın gerçek TableId'si ile eşleşmeli
// ============================================================
async function transferTable(req, res) {
    const { tableId } = req.params;
    const { OrderId, ToTableId, TransferType, Reason } = req.body;

    const fromTableId = parseInt(tableId, 10);

    if (!OrderId || !ToTableId || !TransferType) {
        return res.status(400).json({ error: 'OrderId, ToTableId ve TransferType zorunludur' });
    }

    if (TransferType !== 'Move' && TransferType !== 'Merge') {
        return res.status(400).json({ error: "TransferType 'Move' veya 'Merge' olmalıdır" });
    }

    if (fromTableId === ToTableId) {
        return res.status(400).json({ error: 'Kaynak ve hedef masa aynı olamaz' });
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

        // --- Kaynak siparişi doğrula ---
        // UPDLOCK+ROWLOCK: aynı sipariş için eşzamanlı iki transfer isteği
        // (ör. iki kasiyer aynı anda) birbirini bekler, ikisi de aynı Status
        // anlık görüntüsünü geçerli sanıp çakışan şekilde işlem yapamaz.
        const orderResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, OrderId)
            .query(`SELECT OrderId, TableId, Status, TotalAmount FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId = @OrderId`);

        if (orderResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const fromOrder = orderResult.recordset[0];

        if (fromOrder.TableId !== fromTableId) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Bu sipariş belirtilen kaynak masaya ait değil' });
        }

        if (['Paid', 'Cancelled', 'Merged'].includes(fromOrder.Status)) {
            await transaction.rollback();
            return res.status(400).json({ error: `Bu sipariş '${fromOrder.Status}' durumunda, taşınamaz` });
        }

        // --- Hedef masayı doğrula ---
        const toTableResult = await new sql.Request(transaction)
            .input('ToTableId', sql.Int, ToTableId)
            .query(`SELECT TableId, Status FROM Tables WHERE TableId = @ToTableId`);

        if (toTableResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Hedef masa bulunamadı' });
        }

        // Hedef masadaki aktif siparişi bul (varsa) — burada da UPDLOCK: aynı
        // hedef masaya eşzamanlı iki merge/move çakışmasın.
        const activeToOrderResult = await new sql.Request(transaction)
            .input('ToTableId', sql.Int, ToTableId)
            .query(`SELECT OrderId, TotalAmount FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE TableId = @ToTableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')`);

        const activeToOrder = activeToOrderResult.recordset[0] || null;

        // ============================================================
        // MOVE: hedef masada aktif sipariş OLMAMALI
        // ============================================================
        if (TransferType === 'Move') {
            if (activeToOrder) {
                await transaction.rollback();
                return res.status(409).json({ error: 'Hedef masada zaten aktif bir sipariş var. Bunun için TransferType=\'Merge\' kullanın.' });
            }

            await new sql.Request(transaction)
                .input('OrderId', sql.Int, OrderId)
                .input('ToTableId', sql.Int, ToTableId)
                .query(`UPDATE Orders SET TableId = @ToTableId WHERE OrderId = @OrderId`);

            await new sql.Request(transaction)
                .input('FromTableId', sql.Int, fromTableId)
                .query(`UPDATE Tables SET Status = 'Empty' WHERE TableId = @FromTableId`);

            await new sql.Request(transaction)
                .input('ToTableId', sql.Int, ToTableId)
                .query(`UPDATE Tables SET Status = 'Occupied' WHERE TableId = @ToTableId`);

            await new sql.Request(transaction)
                .input('OrderId', sql.Int, OrderId)
                .input('FromTableId', sql.Int, fromTableId)
                .input('ToTableId', sql.Int, ToTableId)
                .input('TransferType', sql.NVarChar(10), 'Move')
                .input('TransferredByUserId', sql.Int, req.user.userId)
                .input('Reason', sql.NVarChar(255), Reason || null)
                .query(`INSERT INTO TableTransferLog (OrderId, FromTableId, ToTableId, TransferType, MergedIntoOrderId, TransferredByUserId, Reason)
                        VALUES (@OrderId, @FromTableId, @ToTableId, @TransferType, NULL, @TransferredByUserId, @Reason)`);

            await transaction.commit();
            emitTablesChanged();
            logAudit(pool, { userId: req.user?.userId, action: 'TABLE_TRANSFER', entityType: 'Order', entityId: OrderId, details: { type: 'Move', fromTableId, toTableId: ToTableId, reason: Reason || null } });

            return res.status(200).json({ message: 'Sipariş başarıyla taşındı.', orderId: OrderId, fromTableId, toTableId: ToTableId });
        }

        // ============================================================
        // MERGE: hedef masada aktif sipariş OLMALI
        // ============================================================
        if (!activeToOrder) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Hedef masada aktif sipariş yok, merge yapılamaz. Bunun için TransferType=\'Move\' kullanın.' });
        }

        const toOrderId = activeToOrder.OrderId;

        // Kaynak siparişin kalemlerini al
        const fromDetailsResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, OrderId)
            .query(`SELECT OrderDetailsId, ProductId, Quantity, UnitPrice, VariantId, Note FROM OrderDetails WHERE OrderId = @OrderId`);

        for (const item of fromDetailsResult.recordset) {
            // Aynı ürün + aynı varyant hedefte zaten var mı? (VariantId NULL-safe
            // karşılaştırılır — farklı varyantlar, örn. Büyük/Küçük boy, asla
            // birbirine karışıp aynı satırda toplanmamalı.)
            const targetRowResult = await new sql.Request(transaction)
                .input('ToOrderId', sql.Int, toOrderId)
                .input('ProductId', sql.Int, item.ProductId)
                .input('VariantId', sql.Int, item.VariantId)
                .query(`SELECT OrderDetailsId, Quantity, UnitPrice, Note FROM OrderDetails
                        WHERE OrderId = @ToOrderId AND ProductId = @ProductId
                          AND ISNULL(VariantId, -1) = ISNULL(@VariantId, -1)`);

            const targetRow = targetRowResult.recordset[0];
            const notesMatch = targetRow && (targetRow.Note || null) === (item.Note || null);

            if (targetRow) {
                // Fiyat farklıysa merge tamamen durdurulur (aynı ürün/varyant iki
                // farklı fiyatta olamaz — veri bütünlüğü ihlali sinyali)
                if (Number(targetRow.UnitPrice) !== Number(item.UnitPrice)) {
                    await transaction.rollback();
                    return res.status(409).json({
                        error: `Ürün (ProductId: ${item.ProductId}) için fiyat uyuşmazlığı var. Kaynak: ${item.UnitPrice}, Hedef: ${targetRow.UnitPrice}. Merge iptal edildi.`
                    });
                }
            }

            if (targetRow && notesMatch) {
                // Aynı ürün/varyant/not -> miktarları topla, kaynak satırı sil
                await new sql.Request(transaction)
                    .input('OrderDetailsId', sql.Int, targetRow.OrderDetailsId)
                    .input('NewQuantity', sql.Int, targetRow.Quantity + item.Quantity)
                    .query(`UPDATE OrderDetails SET Quantity = @NewQuantity WHERE OrderDetailsId = @OrderDetailsId`);

                // Kaynak kaleme kalem-bazlı ödeme yapılmışsa (PaymentItems), satır silinmeden
                // önce bu kayıtlar hedef kaleme yeniden yönlendirilir — aksi halde hem FK
                // silmeyi engeller hem de o kalemdeki ödenmiş adet bilgisi kaybolurdu.
                await new sql.Request(transaction)
                    .input('FromOrderDetailsId', sql.Int, item.OrderDetailsId)
                    .input('ToOrderDetailsId', sql.Int, targetRow.OrderDetailsId)
                    .query(`UPDATE PaymentItems SET OrderDetailsId = @ToOrderDetailsId WHERE OrderDetailsId = @FromOrderDetailsId`);

                await new sql.Request(transaction)
                    .input('OrderDetailsId', sql.Int, item.OrderDetailsId)
                    .query(`DELETE FROM OrderDetails WHERE OrderDetailsId = @OrderDetailsId`);

            } else {
                // Ürün/varyant hedefte yok, VEYA aynı üründe farklı bir not var
                // (ör. "az şekerli" vs "normal") -> ayrı satır olarak taşınır,
                // notu kaybolmaz. OrderDetailsId değişmediği için PaymentItems
                // zaten doğru satırı işaret etmeye devam eder.
                await new sql.Request(transaction)
                    .input('OrderDetailsId', sql.Int, item.OrderDetailsId)
                    .input('ToOrderId', sql.Int, toOrderId)
                    .query(`UPDATE OrderDetails SET OrderId = @ToOrderId WHERE OrderDetailsId = @OrderDetailsId`);
            }
        }

        // Kaynak siparişe ait ödemeler de hedefe taşınır — aksi halde kaynak
        // sipariş 'Merged' olduktan sonra bu ödemeler hiçbir aktif siparişin
        // bakiyesinden düşülmez ve misafirden zaten ödediği tutar tekrar
        // istenebilir (bkz. paymentController.js recalculateOrderStatus/getBalance).
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, OrderId)
            .input('ToOrderId', sql.Int, toOrderId)
            .query(`UPDATE Payments SET OrderId = @ToOrderId WHERE OrderId = @OrderId`);

        // Hedef siparişin toplamını yeniden hesapla
        const recalcResult = await new sql.Request(transaction)
            .input('ToOrderId', sql.Int, toOrderId)
            .query(`SELECT SUM(Quantity * UnitPrice) AS NewTotal FROM OrderDetails WHERE OrderId = @ToOrderId`);

        const newTotal = recalcResult.recordset[0].NewTotal || 0;

        await new sql.Request(transaction)
            .input('ToOrderId', sql.Int, toOrderId)
            .input('NewTotal', sql.Decimal(10, 2), newTotal)
            .query(`UPDATE Orders SET TotalAmount = @NewTotal WHERE OrderId = @ToOrderId`);

        // Kaynak sipariş Merged olarak işaretlenir
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, OrderId)
            .query(`UPDATE Orders SET Status = 'Merged' WHERE OrderId = @OrderId`);

        // Kaynak masa boşalır
        await new sql.Request(transaction)
            .input('FromTableId', sql.Int, fromTableId)
            .query(`UPDATE Tables SET Status = 'Empty' WHERE TableId = @FromTableId`);

        // Hedef masa zaten dolu olmalı ama garanti altına alalım
        await new sql.Request(transaction)
            .input('ToTableId', sql.Int, ToTableId)
            .query(`UPDATE Tables SET Status = 'Occupied' WHERE TableId = @ToTableId`);

        // Log kaydı
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, OrderId)
            .input('FromTableId', sql.Int, fromTableId)
            .input('ToTableId', sql.Int, ToTableId)
            .input('TransferType', sql.NVarChar(10), 'Merge')
            .input('MergedIntoOrderId', sql.Int, toOrderId)
            .input('TransferredByUserId', sql.Int, req.user.userId)
            .input('Reason', sql.NVarChar(255), Reason || null)
            .query(`INSERT INTO TableTransferLog (OrderId, FromTableId, ToTableId, TransferType, MergedIntoOrderId, TransferredByUserId, Reason)
                    VALUES (@OrderId, @FromTableId, @ToTableId, @TransferType, @MergedIntoOrderId, @TransferredByUserId, @Reason)`);

        await transaction.commit();
        emitTablesChanged();
        logAudit(pool, { userId: req.user?.userId, action: 'TABLE_TRANSFER', entityType: 'Order', entityId: OrderId, details: { type: 'Merge', fromTableId, toTableId: ToTableId, mergedIntoOrderId: toOrderId, reason: Reason || null } });

        return res.status(200).json({
            message: 'Siparişler başarıyla birleştirildi.',
            mergedFromOrderId: OrderId,
            mergedIntoOrderId: toOrderId,
            newTotalAmount: newTotal
        });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata (muhtemelen zaten abort olmuş):', rollbackErr.message);
        }
        console.error('Masa transferi sırasında hata:', err);
        return res.status(500).json({ error: 'Masa transferi/merge işlemi başarısız oldu' });
    }
}

// ============================================================
// TEK MASAYI DETAYIYLA GETİR (varsa aktif siparişiyle birlikte)
// Aktif sipariş = Status NOT IN ('Paid','Cancelled','Merged')
// ============================================================
async function getTableById(req, res) {
    const { id } = req.params;

    try {
        const pool = await connectDB();

        const tableResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT TableId, TableNumber, Capacity, Status, Area FROM Tables WHERE TableId = @TableId`);

        if (tableResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }

        const orderResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT TOP 1 OrderId, UserId, Status, TotalAmount, Note, CreatedAt FROM Orders
                    WHERE TableId = @TableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')
                    ORDER BY OrderId DESC`);

        let activeOrder = null;
        if (orderResult.recordset.length > 0) {
            const order = orderResult.recordset[0];
            const detailsResult = await pool.request()
                .input('OrderId', sql.Int, order.OrderId)
                .query(`SELECT OrderDetailsId, ProductId, Quantity, UnitPrice, VariantId, Note FROM OrderDetails WHERE OrderId = @OrderId`);

            const itemsWithOptions = await attachOrderItemOptions(pool, order.OrderId, detailsResult.recordset);

            activeOrder = { ...order, items: itemsWithOptions };
        }

        return res.status(200).json({
            ...tableResult.recordset[0],
            activeOrder
        });
    } catch (err) {
        console.error('Masa detayı getirilirken hata:', err);
        return res.status(500).json({ error: 'Masa detayı getirilemedi' });
    }
}

// ============================================================
// MASA DURUMUNU ELLE GÜNCELLE (Empty / Occupied / Reserved)
// Aktif bir siparişi olan masanın durumu elle değiştirilemez;
// bunun için sipariş/transfer akışları (create/cancel/transfer) kullanılır.
// ============================================================
async function updateTableStatus(req, res) {
    const { id } = req.params;
    const { Status } = req.body;

    const ALLOWED_STATUSES = ['Empty', 'Occupied', 'Reserved'];

    if (!Status || !ALLOWED_STATUSES.includes(Status)) {
        return res.status(400).json({ error: `Status şunlardan biri olmalı: ${ALLOWED_STATUSES.join(', ')}` });
    }

    try {
        const pool = await connectDB();

        const tableResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT TableId FROM Tables WHERE TableId = @TableId`);

        if (tableResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }

        const activeOrderResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT OrderId FROM Orders WHERE TableId = @TableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')`);

        if (activeOrderResult.recordset.length > 0) {
            return res.status(400).json({
                error: 'Bu masada aktif bir sipariş var, durumu elle değiştirilemez. Siparişi taşıyın/iptal edin/kapatın.'
            });
        }

        const result = await pool.request()
            .input('TableId', sql.Int, id)
            .input('Status', sql.NVarChar(20), Status)
            .query(`UPDATE Tables SET Status = @Status WHERE TableId = @TableId`);

        const updated = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT * FROM Tables WHERE TableId = @TableId`);

        emitTablesChanged();
        return res.status(200).json(updated.recordset[0]);
    } catch (err) {
        console.error('Masa durumu güncellenirken hata:', err);
        return res.status(500).json({ error: 'Masa durumu güncellenemedi' });
    }
}

// ============================================================
// YENİ MASA OLUŞTUR (SADECE ADMIN)
// ============================================================
async function createTable(req, res) {
    const { TableNumber, Capacity, Area } = req.body;

    if (!TableNumber) {
        return res.status(400).json({ error: 'TableNumber zorunludur' });
    }

    try {
        const pool = await connectDB();

        if (Area !== undefined && Area !== null && !(await isActiveArea(pool, Area))) {
            return res.status(400).json({ error: 'Geçerli (aktif) bir bölüm seçin' });
        }

        const existing = await pool.request()
            .input('TableNumber', sql.Int, TableNumber)
            .query(`SELECT TableId FROM Tables WHERE TableNumber = @TableNumber`);

        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: `${TableNumber} numaralı masa zaten var` });
        }

        const result = await pool.request()
            .input('TableNumber', sql.Int, TableNumber)
            .input('Capacity', sql.Int, Capacity || null)
            .input('Area', sql.NVarChar(20), Area || 'Salon')
            .query(`INSERT INTO Tables (TableNumber, Capacity, Status, Area) OUTPUT INSERTED.*
                    VALUES (@TableNumber, @Capacity, 'Empty', @Area)`);

        emitTablesChanged();
        return res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Masa oluşturulurken hata:', err);
        return res.status(500).json({ error: 'Masa oluşturulamadı' });
    }
}

// ============================================================
// MASA BİLGİLERİNİ DÜZENLE (SADECE ADMIN)
// Sadece TableNumber / Capacity düzenlenir; Status için updateTableStatus kullanılır.
// ============================================================
async function updateTable(req, res) {
    const { id } = req.params;
    const { TableNumber, Capacity, Area } = req.body;
    const capacityProvided = Object.prototype.hasOwnProperty.call(req.body, 'Capacity');
    const areaProvided = Object.prototype.hasOwnProperty.call(req.body, 'Area');

    if (!TableNumber && !capacityProvided && !areaProvided) {
        return res.status(400).json({ error: 'Güncellemek için TableNumber, Capacity veya Area gönderin' });
    }

    try {
        const pool = await connectDB();

        if (areaProvided && !(await isActiveArea(pool, Area))) {
            return res.status(400).json({ error: 'Geçerli (aktif) bir bölüm seçin' });
        }

        const tableResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT TableId, TableNumber, Capacity, Area FROM Tables WHERE TableId = @TableId`);

        if (tableResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }

        if (TableNumber) {
            const existing = await pool.request()
                .input('TableNumber', sql.Int, TableNumber)
                .input('TableId', sql.Int, id)
                .query(`SELECT TableId FROM Tables WHERE TableNumber = @TableNumber AND TableId != @TableId`);

            if (existing.recordset.length > 0) {
                return res.status(409).json({ error: `${TableNumber} numaralı masa zaten var` });
            }
        }

        const finalTableNumber = TableNumber || tableResult.recordset[0].TableNumber;
        const finalCapacity = capacityProvided ? (Capacity || null) : tableResult.recordset[0].Capacity;
        const finalArea = areaProvided ? Area : tableResult.recordset[0].Area;

        const result = await pool.request()
            .input('TableId', sql.Int, id)
            .input('TableNumber', sql.Int, finalTableNumber)
            .input('Capacity', sql.Int, finalCapacity)
            .input('Area', sql.NVarChar(20), finalArea)
            .query(`UPDATE Tables SET TableNumber = @TableNumber, Capacity = @Capacity, Area = @Area WHERE TableId = @TableId`);

        const updated = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT * FROM Tables WHERE TableId = @TableId`);

        emitTablesChanged();
        return res.status(200).json(updated.recordset[0]);
    } catch (err) {
        console.error('Masa güncellenirken hata:', err);
        return res.status(500).json({ error: 'Masa güncellenemedi' });
    }
}

// ============================================================
// MASA SİL (SADECE ADMIN)
// Aktif siparişi varsa engellenir; geçmiş sipariş kaydı (FK) varsa
// veritabanı hatası yakalanıp anlaşılır mesaj döndürülür.
// ============================================================
async function deleteTable(req, res) {
    const { id } = req.params;

    try {
        const pool = await connectDB();

        const tableResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT TableId FROM Tables WHERE TableId = @TableId`);

        if (tableResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }

        const activeOrderResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT OrderId FROM Orders WHERE TableId = @TableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')`);

        if (activeOrderResult.recordset.length > 0) {
            return res.status(400).json({ error: 'Bu masada aktif bir sipariş var, önce kapatılmadan silinemez.' });
        }

        await pool.request()
            .input('TableId', sql.Int, id)
            .query(`DELETE FROM Tables WHERE TableId = @TableId`);

        emitTablesChanged();
        return res.status(200).json({ message: 'Masa silindi.' });
    } catch (err) {
        if (err.number === 547) { // SQL Server foreign key constraint violation
            return res.status(409).json({ error: 'Bu masaya ait geçmiş sipariş/transfer kayıtları var, bu yüzden silinemez.' });
        }
        console.error('Masa silinirken hata:', err);
        return res.status(500).json({ error: 'Masa silinemedi' });
    }
}

// ============================================================
// MASA QR KODLARI (SADECE ADMIN) — müşteri QR menüsü linklerini
// üretmek/yazdırmak için. QrToken hassas bir değer olduğu için
// (bu token'ı bilen, o masa adına anonim sipariş/hizmet isteği
// gönderebilir) yalnızca bu ayrı, Admin'e özel uçtan döner —
// GET /api/tables genel listelemesine dahil edilmez.
// ============================================================
async function getTableQrCodes(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .query(`SELECT TableId, TableNumber, Area, QrToken FROM Tables ORDER BY TableNumber ASC`);
        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Masa QR kodları getirilirken hata:', err);
        return res.status(500).json({ error: 'Masa QR kodları getirilemedi' });
    }
}

module.exports = { getAllTables, transferTable, getTableById, updateTableStatus, createTable, updateTable, deleteTable, getTableQrCodes };