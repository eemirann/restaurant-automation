const { sql, connectDB } = require('../config/db');
const { emitKitchen } = require('../config/socket');

const PREP_STATUSES = ['New', 'Preparing', 'Ready', 'Served'];

// ============================================================
// MUTFAK KUYRUĞU
// Aktif siparişlerdeki (Paid/Cancelled/Merged olmayan) ve henüz
// hazırlanmamış (New/Preparing) kalemleri, en eski önce olacak
// şekilde masa/ürün/not bilgisiyle listeler.
// Opsiyonel: ?status=all -> Ready dahil tüm aktif kalemleri getirir.
// ============================================================
async function getQueue(req, res) {
    try {
        const showAll = req.query.status === 'all';
        const pool = await connectDB();

        const statusFilter = showAll
            ? `od.PrepStatus IN ('New','Preparing','Ready')`
            : `od.PrepStatus IN ('New','Preparing')`;

        const result = await pool.request().query(`
            SELECT od.OrderDetailsId, od.OrderId, od.ProductId, p.Name AS ProductName,
                   od.Quantity, od.Note, od.PrepStatus, od.PreparedAt,
                   o.TableId, t.TableNumber, o.CreatedAt AS OrderCreatedAt
            FROM OrderDetails od
            JOIN Orders o ON o.OrderId = od.OrderId
            JOIN Products p ON p.ProductId = od.ProductId
            LEFT JOIN Tables t ON t.TableId = o.TableId
            WHERE ${statusFilter}
              AND o.Status NOT IN ('Paid', 'Cancelled', 'Merged')
            ORDER BY o.CreatedAt ASC, od.OrderDetailsId ASC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Mutfak kuyruğu getirilirken hata:', err);
        res.status(500).json({ error: 'Mutfak kuyruğu getirilemedi' });
    }
}

// ============================================================
// KALEM HAZIRLANMA DURUMUNU GÜNCELLE
// Body: { PrepStatus }  (New/Preparing/Ready/Served)
// Ready veya Served'e ilk geçişte PreparedAt damgalanır.
// ============================================================
async function updateItemStatus(req, res) {
    try {
        const { orderDetailsId } = req.params;
        const { PrepStatus } = req.body;

        if (!PrepStatus || !PREP_STATUSES.includes(PrepStatus)) {
            return res.status(400).json({
                error: `PrepStatus şunlardan biri olmalı: ${PREP_STATUSES.join(', ')}`
            });
        }

        const pool = await connectDB();

        // PreparedAt: Ready/Served'e geçişte ve daha önce set edilmemişse damgalanır.
        const stampPrepared = (PrepStatus === 'Ready' || PrepStatus === 'Served');

        const result = await pool.request()
            .input('OrderDetailsId', sql.Int, orderDetailsId)
            .input('PrepStatus', sql.NVarChar(20), PrepStatus)
            .input('StampPrepared', sql.Bit, stampPrepared ? 1 : 0)
            .query(`
                UPDATE OrderDetails
                SET PrepStatus = @PrepStatus,
                    PreparedAt = CASE
                        WHEN @StampPrepared = 1 AND PreparedAt IS NULL THEN GETDATE()
                        ELSE PreparedAt
                    END
                OUTPUT INSERTED.OrderDetailsId, INSERTED.OrderId, INSERTED.PrepStatus, INSERTED.PreparedAt
                WHERE OrderDetailsId = @OrderDetailsId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Sipariş kalemi bulunamadı' });
        }

        const updated = result.recordset[0];

        emitKitchen('kds:updated', {
            orderDetailsId: updated.OrderDetailsId,
            orderId: updated.OrderId,
            prepStatus: updated.PrepStatus,
        });

        res.status(200).json(updated);
    } catch (err) {
        console.error('Kalem durumu güncellenirken hata:', err);
        res.status(500).json({ error: 'Kalem durumu güncellenemedi' });
    }
}

module.exports = { getQueue, updateItemStatus };
