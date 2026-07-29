const { sql, connectDB } = require('../config/db');
const { emitTablesChanged, emitKitchen } = require('../config/socket');
const { recalculateOrderStatus } = require('./paymentController');
const { deductStockForItem, restoreStockForItem } = require('../utils/stockDeduction');
const { logAudit } = require('../utils/audit');
const { attachOrderItemOptions } = require('../utils/orderItemOptions');
const { buildOrderInTransaction } = require('../utils/orderBuilder');
const { HttpError } = require('../utils/httpError');

// ============================================================
// SİPARİŞ OLUŞTUR
// GÜVENLİK: UnitPrice client'tan ASLA kabul edilmez.
// Fiyat sunucuda Products.Price (+ ProductVariants.Price varsa) üzerinden hesaplanır.
// ============================================================
async function createOrder(req, res) {
    const { TableId, UserId, Items, Note } = req.body;

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

        const { order, totalAmount, lowStockWarnings } = await buildOrderInTransaction(transaction, { TableId, UserId, Items, Note });

        await transaction.commit();
        emitTablesChanged();
        emitKitchen('kds:new', { orderId: order.OrderId, tableId: TableId });

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
            .query(`SELECT OrderId, TableId, UserId, Status, TotalAmount, Note, CreatedAt FROM Orders WHERE OrderId = @OrderId`);

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

            for (const extra of extrasResult.recordset) {
                await restoreStockForItem(transaction, extra.ExtraProductId, extra.Quantity * item.Quantity);
            }

            const syrupsResult = await new sql.Request(transaction)
                .input('OrderDetailsId', sql.Int, item.OrderDetailsId)
                .query(`SELECT SyrupProductId, Quantity FROM OrderDetailSyrups WHERE OrderDetailsId = @OrderDetailsId`);

            for (const syrup of syrupsResult.recordset) {
                await restoreStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * item.Quantity);
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
        logAudit(pool, { userId: req.user?.userId, action: 'ORDER_CANCEL', entityType: 'Order', entityId: Number(id), details: { TableId } });

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

    if (!Items || Items.length === 0) {
        return res.status(400).json({ error: 'En az bir ürün zorunludur' });
    }

    for (const item of Items) {
        if (typeof item.ProductId !== 'number' || !Number.isInteger(item.Quantity) || item.Quantity <= 0) {
            return res.status(400).json({ error: 'Her ürün için geçerli ProductId ve Quantity giriniz' });
        }
        if (item.VariantId !== undefined && item.VariantId !== null && typeof item.VariantId !== 'number') {
            return res.status(400).json({ error: 'VariantId gönderiliyorsa sayısal olmalıdır' });
        }
        if (item.Extras !== undefined && item.Extras !== null) {
            if (!Array.isArray(item.Extras)) {
                return res.status(400).json({ error: 'Extras gönderiliyorsa bir dizi olmalıdır' });
            }
            for (const extra of item.Extras) {
                if (typeof extra.ExtraProductId !== 'number' || !Number.isInteger(extra.Quantity) || extra.Quantity <= 0) {
                    return res.status(400).json({ error: 'Her ekstra için geçerli ExtraProductId ve pozitif tam sayı Quantity giriniz' });
                }
            }
        }
        if (item.Syrups !== undefined && item.Syrups !== null) {
            if (!Array.isArray(item.Syrups)) {
                return res.status(400).json({ error: 'Syrups gönderiliyorsa bir dizi olmalıdır' });
            }
            for (const syrup of item.Syrups) {
                if (typeof syrup.SyrupProductId !== 'number' || !Number.isInteger(syrup.Quantity) || syrup.Quantity <= 0) {
                    return res.status(400).json({ error: 'Her şurup için geçerli SyrupProductId ve pozitif tam sayı Quantity giriniz' });
                }
            }
        }
    }

    let pool;
    try {
        pool = await connectDB();
    } catch (err) {
        console.error('Veritabanına bağlanılamadı', err);
        return res.status(500).json({ error: 'Veritabanı bağlantı hatası' });
    }

    const transaction = new sql.Transaction(pool);
    const lowStockWarnings = [];

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
            return res.status(400).json({ error: `Bu sipariş '${order.Status}' durumunda, ürün eklenemez.` });
        }

        // ============================================================
        // Her ürün için gerçek fiyatı sunucuda doğrula/hesapla (createOrder ile aynı mantık)
        // ============================================================
        const validatedItems = [];
        let addedAmount = 0;

        for (const item of Items) {
            const productResult = await new sql.Request(transaction)
                .input('ProductId', sql.Int, item.ProductId)
                .query(`SELECT ProductId, Price, IsActive, IsAvailable FROM Products WHERE ProductId = @ProductId`);

            if (productResult.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: `Ürün bulunamadı (ProductId: ${item.ProductId})` });
            }

            const product = productResult.recordset[0];
            if (!product.IsActive) {
                await transaction.rollback();
                return res.status(400).json({ error: `Ürün şu anda aktif değil (ProductId: ${item.ProductId})` });
            }

            if (!product.IsAvailable) {
                await transaction.rollback();
                return res.status(400).json({ error: `Ürün şu anda tükendi/satışta değil (ProductId: ${item.ProductId})` });
            }

            let unitPrice = Number(product.Price);

            if (item.VariantId) {
                const variantResult = await new sql.Request(transaction)
                    .input('VariantId', sql.Int, item.VariantId)
                    .input('ProductId', sql.Int, item.ProductId)
                    .query(`SELECT ProductVariantsId, Price FROM ProductVariants WHERE ProductVariantsId = @VariantId AND ProductId = @ProductId`);

                if (variantResult.recordset.length === 0) {
                    await transaction.rollback();
                    return res.status(400).json({ error: `Varyant bu ürüne ait değil veya bulunamadı (ProductId: ${item.ProductId}, VariantId: ${item.VariantId})` });
                }

                unitPrice += Number(variantResult.recordset[0].Price);
            }

            // Ekstralar (createOrder ile aynı mantık — bkz. orada bırakılan not,
            // ProductExtras üzerinden bu ürüne bağlı+etkin olması şart)
            const resolvedExtras = [];
            for (const extra of (item.Extras || [])) {
                const extraResult = await new sql.Request(transaction)
                    .input('ExtraProductId', sql.Int, extra.ExtraProductId)
                    .input('ProductId', sql.Int, item.ProductId)
                    .query(`
                        SELECT p.ProductId, p.Price, p.IsActive
                        FROM Products p
                        JOIN ProductExtras pe ON pe.ExtraProductId = p.ProductId
                        WHERE p.ProductId = @ExtraProductId AND pe.ProductId = @ProductId AND pe.IsEnabled = 1
                    `);

                if (extraResult.recordset.length === 0) {
                    await transaction.rollback();
                    return res.status(404).json({ error: `Ekstra bu ürüne bağlı değil veya bulunamadı (ExtraProductId: ${extra.ExtraProductId}, ProductId: ${item.ProductId})` });
                }

                const extraProduct = extraResult.recordset[0];
                if (!extraProduct.IsActive) {
                    await transaction.rollback();
                    return res.status(400).json({ error: `Ekstra şu anda aktif değil (ExtraProductId: ${extra.ExtraProductId})` });
                }

                const extraUnitPrice = Number(extraProduct.Price);
                unitPrice += extraUnitPrice * extra.Quantity;
                resolvedExtras.push({ ExtraProductId: extra.ExtraProductId, Quantity: extra.Quantity, UnitPrice: extraUnitPrice });
            }

            // Şuruplar (Ekstralar ile birebir aynı mantık, ProductSyrups üzerinden)
            const resolvedSyrups = [];
            for (const syrup of (item.Syrups || [])) {
                const syrupResult = await new sql.Request(transaction)
                    .input('SyrupProductId', sql.Int, syrup.SyrupProductId)
                    .input('ProductId', sql.Int, item.ProductId)
                    .query(`
                        SELECT p.ProductId, p.Price, p.IsActive
                        FROM Products p
                        JOIN ProductSyrups ps ON ps.SyrupProductId = p.ProductId
                        WHERE p.ProductId = @SyrupProductId AND ps.ProductId = @ProductId AND ps.IsEnabled = 1
                    `);

                if (syrupResult.recordset.length === 0) {
                    await transaction.rollback();
                    return res.status(404).json({ error: `Şurup bu ürüne bağlı değil veya bulunamadı (SyrupProductId: ${syrup.SyrupProductId}, ProductId: ${item.ProductId})` });
                }

                const syrupProduct = syrupResult.recordset[0];
                if (!syrupProduct.IsActive) {
                    await transaction.rollback();
                    return res.status(400).json({ error: `Şurup şu anda aktif değil (SyrupProductId: ${syrup.SyrupProductId})` });
                }

                const syrupUnitPrice = Number(syrupProduct.Price);
                unitPrice += syrupUnitPrice * syrup.Quantity;
                resolvedSyrups.push({ SyrupProductId: syrup.SyrupProductId, Quantity: syrup.Quantity, UnitPrice: syrupUnitPrice });
            }

            validatedItems.push({
                ProductId: item.ProductId,
                Quantity: item.Quantity,
                UnitPrice: unitPrice,
                VariantId: item.VariantId || null,
                Note: item.Note || null,
                Extras: resolvedExtras,
                Syrups: resolvedSyrups
            });

            addedAmount += unitPrice * item.Quantity;
        }

        // ============================================================
        // OrderDetails ekle + stok düş (createOrder ile aynı)
        // NOT: OrderDetails tablosunda [UQ_Order_Product] kısıtı OrderId+ProductId
        // ikilisini unique tutuyor (VariantId'den bağımsız). Yani aynı ürün
        // siparişte zaten varsa yeni bir satır INSERT etmek DB hatasına düşer.
        // Bu yüzden önce var mı diye bakıyoruz; varsa yeni bir satır açmak
        // yerine mevcut satırın Quantity'sini artırıyoruz.
        // ============================================================
        for (const item of validatedItems) {
            const existingResult = await new sql.Request(transaction)
                .input('OrderId', sql.Int, id)
                .input('ProductId', sql.Int, item.ProductId)
                .query(`SELECT OrderDetailsId, Quantity FROM OrderDetails
                        WHERE OrderId = @OrderId AND ProductId = @ProductId`);

            if (existingResult.recordset.length > 0) {
                // NOT: Mevcut satırla birleştirilirken UnitPrice (dolayısıyla Extras)
                // güncellenmez — VariantId'de olduğu gibi zaten var olan davranış.
                // Yani bu kalemde Extras gönderilmişse ve satır zaten varsa yok sayılır.
                const existing = existingResult.recordset[0];
                const mergedQuantity = existing.Quantity + item.Quantity;
                const noteUpdate = item.Note ? item.Note : null;

                await new sql.Request(transaction)
                    .input('OrderDetailsId', sql.Int, existing.OrderDetailsId)
                    .input('Quantity', sql.Int, mergedQuantity)
                    .input('Note', sql.NVarChar, noteUpdate)
                    .query(`UPDATE OrderDetails SET Quantity = @Quantity${noteUpdate ? ', Note = @Note' : ''} WHERE OrderDetailsId = @OrderDetailsId`);

                const warnings = await deductStockForItem(transaction, item.ProductId, item.Quantity);
                lowStockWarnings.push(...warnings);
            } else {
                const insertedDetail = await new sql.Request(transaction)
                    .input('OrderId', sql.Int, id)
                    .input('ProductId', sql.Int, item.ProductId)
                    .input('Quantity', sql.Int, item.Quantity)
                    .input('UnitPrice', sql.Decimal(10, 2), item.UnitPrice)
                    .input('VariantId', sql.Int, item.VariantId)
                    .input('Note', sql.NVarChar, item.Note)
                    .query('INSERT INTO OrderDetails (OrderId, ProductId, Quantity, UnitPrice, VariantId, Note) OUTPUT INSERTED.OrderDetailsId VALUES (@OrderId, @ProductId, @Quantity, @UnitPrice, @VariantId, @Note)');

                const orderDetailsId = insertedDetail.recordset[0].OrderDetailsId;

                const warnings = await deductStockForItem(transaction, item.ProductId, item.Quantity);
                lowStockWarnings.push(...warnings);

                for (const extra of item.Extras) {
                    await new sql.Request(transaction)
                        .input('OrderDetailsId', sql.Int, orderDetailsId)
                        .input('ExtraProductId', sql.Int, extra.ExtraProductId)
                        .input('Quantity', sql.Int, extra.Quantity)
                        .input('UnitPrice', sql.Decimal(10, 2), extra.UnitPrice)
                        .query('INSERT INTO OrderDetailExtras (OrderDetailsId, ExtraProductId, Quantity, UnitPrice) VALUES (@OrderDetailsId, @ExtraProductId, @Quantity, @UnitPrice)');

                    const extraWarnings = await deductStockForItem(transaction, extra.ExtraProductId, extra.Quantity * item.Quantity);
                    lowStockWarnings.push(...extraWarnings);
                }

                for (const syrup of item.Syrups) {
                    await new sql.Request(transaction)
                        .input('OrderDetailsId', sql.Int, orderDetailsId)
                        .input('SyrupProductId', sql.Int, syrup.SyrupProductId)
                        .input('Quantity', sql.Int, syrup.Quantity)
                        .input('UnitPrice', sql.Decimal(10, 2), syrup.UnitPrice)
                        .query('INSERT INTO OrderDetailSyrups (OrderDetailsId, SyrupProductId, Quantity, UnitPrice) VALUES (@OrderDetailsId, @SyrupProductId, @Quantity, @UnitPrice)');

                    const syrupWarnings = await deductStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * item.Quantity);
                    lowStockWarnings.push(...syrupWarnings);
                }
            }
        }

        // Toplamı güncelle (OUTPUT kullanmıyoruz, Orders'ta trigger var)
        const newTotal = Number(order.TotalAmount) + addedAmount;
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .input('TotalAmount', sql.Decimal(10, 2), newTotal)
            .query(`UPDATE Orders SET TotalAmount = @TotalAmount WHERE OrderId = @OrderId`);

        await transaction.commit();
        emitTablesChanged();
        emitKitchen('kds:new', { orderId: Number(id) });

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

        for (const extra of extrasResult.recordset) {
            await restoreStockForItem(transaction, extra.ExtraProductId, extra.Quantity * item.Quantity);
        }

        for (const syrup of syrupsResult.recordset) {
            await restoreStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * item.Quantity);
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

            for (const extra of extrasResult.recordset) {
                if (diff > 0) {
                    await deductStockForItem(transaction, extra.ExtraProductId, extra.Quantity * diff);
                } else {
                    await restoreStockForItem(transaction, extra.ExtraProductId, extra.Quantity * -diff);
                }
            }

            const syrupsResult = await new sql.Request(transaction)
                .input('OrderDetailsId', sql.Int, itemId)
                .query(`SELECT SyrupProductId, Quantity FROM OrderDetailSyrups WHERE OrderDetailsId = @OrderDetailsId`);

            for (const syrup of syrupsResult.recordset) {
                if (diff > 0) {
                    await deductStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * diff);
                } else {
                    await restoreStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * -diff);
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

module.exports = {
    createOrder,
    getAllOrders,
    getOrderById,
    cancelOrder,
    updateOrderStatus,
    addOrderItems,
    removeOrderItem,
    updateOrderItemQuantity
};