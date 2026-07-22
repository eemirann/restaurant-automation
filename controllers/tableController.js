const { sql, connectDB } = require('../config/db');

// ============================================================
// TÜM MASALARI LİSTELE
// Opsiyonel query parametresi: ?status=Empty gibi filtre için
// ============================================================
async function getAllTables(req, res) {
    const { status } = req.query;

    try {
        const pool = await connectDB();
        const request = pool.request();

        let query = `SELECT TableId, TableNumber, Capacity, Status FROM Tables`;

        if (status) {
            request.input('Status', sql.NVarChar(20), status);
            query += ` WHERE Status = @Status`;
        }

        query += ` ORDER BY TableNumber ASC`;

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
        const orderResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, OrderId)
            .query(`SELECT OrderId, TableId, Status, TotalAmount FROM Orders WHERE OrderId = @OrderId`);

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

        // Hedef masadaki aktif siparişi bul (varsa)
        const activeToOrderResult = await new sql.Request(transaction)
            .input('ToTableId', sql.Int, ToTableId)
            .query(`SELECT OrderId, TotalAmount FROM Orders WHERE TableId = @ToTableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')`);

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
            const targetRowResult = await new sql.Request(transaction)
                .input('ToOrderId', sql.Int, toOrderId)
                .input('ProductId', sql.Int, item.ProductId)
                .query(`SELECT OrderDetailsId, Quantity, UnitPrice FROM OrderDetails WHERE OrderId = @ToOrderId AND ProductId = @ProductId`);

            if (targetRowResult.recordset.length > 0) {
                const targetRow = targetRowResult.recordset[0];

                // Fiyat farklıysa merge tamamen durdurulur
                if (Number(targetRow.UnitPrice) !== Number(item.UnitPrice)) {
                    await transaction.rollback();
                    return res.status(409).json({
                        error: `Ürün (ProductId: ${item.ProductId}) için fiyat uyuşmazlığı var. Kaynak: ${item.UnitPrice}, Hedef: ${targetRow.UnitPrice}. Merge iptal edildi.`
                    });
                }

                // Aynı ürün, aynı fiyat -> miktarları topla, kaynak satırı sil
                await new sql.Request(transaction)
                    .input('OrderDetailsId', sql.Int, targetRow.OrderDetailsId)
                    .input('NewQuantity', sql.Int, targetRow.Quantity + item.Quantity)
                    .query(`UPDATE OrderDetails SET Quantity = @NewQuantity WHERE OrderDetailsId = @OrderDetailsId`);

                await new sql.Request(transaction)
                    .input('OrderDetailsId', sql.Int, item.OrderDetailsId)
                    .query(`DELETE FROM OrderDetails WHERE OrderDetailsId = @OrderDetailsId`);

            } else {
                // Ürün hedefte yok -> satırı doğrudan hedefe taşı
                await new sql.Request(transaction)
                    .input('OrderDetailsId', sql.Int, item.OrderDetailsId)
                    .input('ToOrderId', sql.Int, toOrderId)
                    .query(`UPDATE OrderDetails SET OrderId = @ToOrderId WHERE OrderDetailsId = @OrderDetailsId`);
            }
        }

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
            .query(`SELECT TableId, TableNumber, Capacity, Status FROM Tables WHERE TableId = @TableId`);

        if (tableResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Masa bulunamadı' });
        }

        const orderResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT OrderId, UserId, Status, TotalAmount, Note, CreatedAt FROM Orders
                    WHERE TableId = @TableId AND Status NOT IN ('Paid', 'Cancelled', 'Merged')`);

        let activeOrder = null;
        if (orderResult.recordset.length > 0) {
            const order = orderResult.recordset[0];
            const detailsResult = await pool.request()
                .input('OrderId', sql.Int, order.OrderId)
                .query(`SELECT ProductId, Quantity, UnitPrice, VariantId, Note FROM OrderDetails WHERE OrderId = @OrderId`);

            activeOrder = { ...order, items: detailsResult.recordset };
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
    const { TableNumber, Capacity } = req.body;

    if (!TableNumber || !Capacity) {
        return res.status(400).json({ error: 'TableNumber ve Capacity zorunludur' });
    }

    try {
        const pool = await connectDB();

        const existing = await pool.request()
            .input('TableNumber', sql.Int, TableNumber)
            .query(`SELECT TableId FROM Tables WHERE TableNumber = @TableNumber`);

        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: `${TableNumber} numaralı masa zaten var` });
        }

        const result = await pool.request()
            .input('TableNumber', sql.Int, TableNumber)
            .input('Capacity', sql.Int, Capacity)
            .query(`INSERT INTO Tables (TableNumber, Capacity, Status) OUTPUT INSERTED.*
                    VALUES (@TableNumber, @Capacity, 'Empty')`);

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
    const { TableNumber, Capacity } = req.body;

    if (!TableNumber && !Capacity) {
        return res.status(400).json({ error: 'Güncellemek için TableNumber veya Capacity gönderin' });
    }

    try {
        const pool = await connectDB();

        const tableResult = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT TableId, TableNumber, Capacity FROM Tables WHERE TableId = @TableId`);

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
        const finalCapacity = Capacity || tableResult.recordset[0].Capacity;

        const result = await pool.request()
            .input('TableId', sql.Int, id)
            .input('TableNumber', sql.Int, finalTableNumber)
            .input('Capacity', sql.Int, finalCapacity)
            .query(`UPDATE Tables SET TableNumber = @TableNumber, Capacity = @Capacity WHERE TableId = @TableId`);

        const updated = await pool.request()
            .input('TableId', sql.Int, id)
            .query(`SELECT * FROM Tables WHERE TableId = @TableId`);

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

        return res.status(200).json({ message: 'Masa silindi.' });
    } catch (err) {
        if (err.number === 547) { // SQL Server foreign key constraint violation
            return res.status(409).json({ error: 'Bu masaya ait geçmiş sipariş/transfer kayıtları var, bu yüzden silinemez.' });
        }
        console.error('Masa silinirken hata:', err);
        return res.status(500).json({ error: 'Masa silinemedi' });
    }
}

module.exports = { getAllTables, transferTable, getTableById, updateTableStatus, createTable, updateTable, deleteTable };