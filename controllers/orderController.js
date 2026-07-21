const { sql, connectDB } = require('../config/db');

// ============================================================
// SİPARİŞ OLUŞTUR
// GÜVENLİK: UnitPrice client'tan ASLA kabul edilmez.
// Fiyat sunucuda Products.Price (+ ProductVariants.Price varsa) üzerinden hesaplanır.
// ============================================================
async function createOrder(req, res) {
    const { TableId, UserId, Items, Note } = req.body;

    if (!TableId || !UserId || !Items || Items.length === 0) {
        return res.status(400).json({ error: 'Masa, kullanıcı ve en az bir ürün zorunludur' });
    }

    for (const item of Items) {
        if (typeof item.ProductId !== 'number' || !Number.isInteger(item.Quantity) || item.Quantity <= 0) {
            return res.status(400).json({ error: 'Her ürün için geçerli ProductId ve Quantity giriniz' });
        }
        if (item.VariantId !== undefined && item.VariantId !== null && typeof item.VariantId !== 'number') {
            return res.status(400).json({ error: 'VariantId gönderiliyorsa sayısal olmalıdır' });
        }
        // NOT: Client UnitPrice gönderse bile burada hiç okunmuyor, tamamen yok sayılıyor.
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

        // ============================================================
        // 1. ADIM: Her ürün için gerçek fiyatı sunucuda doğrula/hesapla
        // ============================================================
        const validatedItems = [];
        let totalAmount = 0;

        for (const item of Items) {
            const productResult = await new sql.Request(transaction)
                .input('ProductId', sql.Int, item.ProductId)
                .query(`SELECT ProductId, Price, IsActive FROM Products WHERE ProductId = @ProductId`);

            if (productResult.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: `Ürün bulunamadı (ProductId: ${item.ProductId})` });
            }

            const product = productResult.recordset[0];

            if (!product.IsActive) {
                await transaction.rollback();
                return res.status(400).json({ error: `Ürün şu anda aktif değil (ProductId: ${item.ProductId})` });
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

            validatedItems.push({
                ProductId: item.ProductId,
                Quantity: item.Quantity,
                UnitPrice: unitPrice,
                VariantId: item.VariantId || null,
                Note: item.Note || null
            });

            totalAmount += unitPrice * item.Quantity;
        }

        // ============================================================
        // 2. ADIM: Siparişi doğrulanmış toplam ile oluştur
        // ============================================================
        const orderResult = await new sql.Request(transaction)
            .input('TableId', sql.Int, TableId)
            .input('UserId', sql.Int, UserId)
            .input('TotalAmount', sql.Decimal(10, 2), totalAmount)
            .input('Note', sql.NVarChar, Note || null)
            .query(`DECLARE @InsertedOrders TABLE (
                    OrderId INT, TableId INT, UserId INT, TotalAmount DECIMAL(10,2),
                    Status NVARCHAR(50), Note NVARCHAR(MAX), CreatedAt DATETIME);
                    INSERT INTO Orders (TableId, UserId, TotalAmount, Note) OUTPUT INSERTED.OrderId, INSERTED.TableId, INSERTED.UserId, 
                    INSERTED.TotalAmount, INSERTED.Status, 
                    INSERTED.Note, INSERTED.CreatedAt INTO @InsertedOrders (OrderId, TableId, UserId, TotalAmount, Status, Note, CreatedAt) VALUES (@TableId, @UserId, @TotalAmount, @Note);
                    SELECT * FROM @InsertedOrders;`);

        const newOrderId = orderResult.recordset[0].OrderId;

        // ============================================================
        // 3. ADIM: Doğrulanmış fiyatlarla OrderDetails + stok düşümü
        // ============================================================
        for (const item of validatedItems) {
            await new sql.Request(transaction)
                .input('OrderId', sql.Int, newOrderId)
                .input('ProductId', sql.Int, item.ProductId)
                .input('Quantity', sql.Int, item.Quantity)
                .input('UnitPrice', sql.Decimal(10, 2), item.UnitPrice)
                .input('VariantId', sql.Int, item.VariantId)
                .input('Note', sql.NVarChar, item.Note)
                .query('INSERT INTO OrderDetails (OrderId, ProductId, Quantity, UnitPrice, VariantId, Note) VALUES (@OrderId, @ProductId, @Quantity, @UnitPrice, @VariantId, @Note)');

            const stockResult = await new sql.Request(transaction)
                .input('ProductId', sql.Int, item.ProductId)
                .input('Quantity', sql.Int, item.Quantity)
                .query(`UPDATE Stock SET Quantity = Quantity - @Quantity OUTPUT INSERTED.Quantity, INSERTED.MinStockLevel WHERE ProductId = @ProductId AND IsTracked = 1`);

            if (stockResult.recordset.length > 0) {
                const newQuantity = stockResult.recordset[0].Quantity;
                const minLevel = stockResult.recordset[0].MinStockLevel;

                if (newQuantity <= minLevel) {
                    lowStockWarnings.push({
                        ProductId: item.ProductId,
                        RemainingStock: newQuantity,
                        IsNegative: newQuantity < 0
                    });
                }
            }
        }

        await transaction.commit();

        res.status(201).json({
            message: 'Sipariş başarıyla oluşturuldu.',
            order: orderResult.recordset[0],
            totalAmount: totalAmount,
            lowStockWarnings: lowStockWarnings
        });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata (muhtemelen zaten abort olmuş):', rollbackErr.message);
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
            .query(`SELECT ProductId, Quantity, UnitPrice, VariantId, Note FROM OrderDetails WHERE OrderId = @OrderId`);

        return res.status(200).json({
            ...orderResult.recordset[0],
            items: detailsResult.recordset
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
            .query(`SELECT Status FROM Orders WHERE OrderId = @OrderId`);

        if (orderResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        if (orderResult.recordset[0].Status === 'Cancelled') {
            await transaction.rollback();
            return res.status(400).json({ error: 'Bu sipariş zaten iptal edilmiş' });
        }

        const detailsResult = await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .query(`SELECT ProductId, Quantity FROM OrderDetails WHERE OrderId = @OrderId`);

        for (const item of detailsResult.recordset) {
            await new sql.Request(transaction)
                .input('ProductId', sql.Int, item.ProductId)
                .input('Quantity', sql.Int, item.Quantity)
                .query(`UPDATE Stock SET Quantity = Quantity + @Quantity WHERE ProductId = @ProductId AND IsTracked = 1`);
        }

        await new sql.Request(transaction)
            .input('OrderId', sql.Int, id)
            .query(`UPDATE Orders SET Status = 'Cancelled' WHERE OrderId = @OrderId`);

        await transaction.commit();

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

module.exports = { createOrder, getAllOrders, getOrderById, cancelOrder };