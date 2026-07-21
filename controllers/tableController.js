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

module.exports = { getAllTables, transferTable };