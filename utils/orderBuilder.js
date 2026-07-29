const { sql } = require('../config/db');
const { deductStockForItem } = require('./stockDeduction');
const { HttpError } = require('./httpError');

// ============================================================
// Sipariş kalemlerinin (Items) şekil doğrulaması. Fiyat/stok/ekstra
// gibi VERİTABANINA bağlı doğrulamalar burada YAPILMAZ — sadece
// gövdenin (body) biçimi kontrol edilir. Hem createOrder (HTTP) hem
// de müşteri QR siparişi onaylanırken (customerOrderController)
// kullanılır.
// ============================================================
function validateOrderItemsShape(TableId, UserId, Items) {
    if (!TableId || !UserId || !Items || Items.length === 0) {
        throw new HttpError(400, 'Masa, kullanıcı ve en az bir ürün zorunludur');
    }

    for (const item of Items) {
        if (typeof item.ProductId !== 'number' || !Number.isInteger(item.Quantity) || item.Quantity <= 0) {
            throw new HttpError(400, 'Her ürün için geçerli ProductId ve Quantity giriniz');
        }
        if (item.VariantId !== undefined && item.VariantId !== null && typeof item.VariantId !== 'number') {
            throw new HttpError(400, 'VariantId gönderiliyorsa sayısal olmalıdır');
        }
        if (item.Extras !== undefined && item.Extras !== null) {
            if (!Array.isArray(item.Extras)) {
                throw new HttpError(400, 'Extras gönderiliyorsa bir dizi olmalıdır');
            }
            for (const extra of item.Extras) {
                if (typeof extra.ExtraProductId !== 'number' || !Number.isInteger(extra.Quantity) || extra.Quantity <= 0) {
                    throw new HttpError(400, 'Her ekstra için geçerli ExtraProductId ve pozitif tam sayı Quantity giriniz');
                }
            }
        }
        if (item.Syrups !== undefined && item.Syrups !== null) {
            if (!Array.isArray(item.Syrups)) {
                throw new HttpError(400, 'Syrups gönderiliyorsa bir dizi olmalıdır');
            }
            for (const syrup of item.Syrups) {
                if (typeof syrup.SyrupProductId !== 'number' || !Number.isInteger(syrup.Quantity) || syrup.Quantity <= 0) {
                    throw new HttpError(400, 'Her şurup için geçerli SyrupProductId ve pozitif tam sayı Quantity giriniz');
                }
            }
        }
        // NOT: Client UnitPrice gönderse bile burada hiç okunmuyor, tamamen yok sayılıyor.
    }
}

// ============================================================
// Bir siparişi, AÇIK bir transaction içinde, fiyatları sunucuda
// yeniden hesaplayarak oluşturur (Orders + OrderDetails +
// OrderDetailExtras/Syrups + stok düşümü + masa/rezervasyon durumu).
// GÜVENLİK: UnitPrice client'tan ASLA kabul edilmez, Products.Price
// (+ ProductVariants/ProductExtras/ProductSyrups) üzerinden hesaplanır.
//
// Çağıran taraf transaction.begin()/commit()/rollback() ve
// socket/audit event'lerini kendisi yönetir (bkz. orderController.createOrder
// ve customerOrderController.approveCustomerOrderRequest — ikisi de bu
// fonksiyonu kullanır, aynı fiyat/stok mantığının iki yerde ayrı ayrı
// bakımı gerekmesin diye).
//
// Hata durumunda HttpError fırlatır (transaction'ı KENDİSİ rollback
// yapmaz — çağıran taraf catch bloğunda rollback + err.statusCode'a göre
// cevap üretir).
// ============================================================
async function buildOrderInTransaction(transaction, { TableId, UserId, Items, Note }) {
    validateOrderItemsShape(TableId, UserId, Items);

    const validatedItems = [];
    let totalAmount = 0;

    for (const item of Items) {
        const productResult = await new sql.Request(transaction)
            .input('ProductId', sql.Int, item.ProductId)
            .query(`SELECT ProductId, Price, IsActive, IsAvailable FROM Products WHERE ProductId = @ProductId`);

        if (productResult.recordset.length === 0) {
            throw new HttpError(404, `Ürün bulunamadı (ProductId: ${item.ProductId})`);
        }

        const product = productResult.recordset[0];

        if (!product.IsActive) {
            throw new HttpError(400, `Ürün şu anda aktif değil (ProductId: ${item.ProductId})`);
        }

        if (!product.IsAvailable) {
            throw new HttpError(400, `Ürün şu anda tükendi/satışta değil (ProductId: ${item.ProductId})`);
        }

        let unitPrice = Number(product.Price);

        if (item.VariantId) {
            const variantResult = await new sql.Request(transaction)
                .input('VariantId', sql.Int, item.VariantId)
                .input('ProductId', sql.Int, item.ProductId)
                .query(`SELECT ProductVariantsId, Price FROM ProductVariants WHERE ProductVariantsId = @VariantId AND ProductId = @ProductId`);

            if (variantResult.recordset.length === 0) {
                throw new HttpError(400, `Varyant bu ürüne ait değil veya bulunamadı (ProductId: ${item.ProductId}, VariantId: ${item.VariantId})`);
            }

            unitPrice += Number(variantResult.recordset[0].Price);
        }

        // Ekstralar (ekstra shot, ekstra çikolata vb.) — her biri kalemin
        // kendi Quantity'siyle çarpılacağı için burada fiyatı TEK adet
        // başına unitPrice'a eklenir (VariantId ile aynı mantık). Ayrıca
        // bu ekstranın YÖNETİCİ TARAFINDAN bu ürüne bağlı ve etkin olması
        // şart (ProductExtras) — global IsExtra=1 olması yetmez (bkz.
        // migrations/2026_07_29_product_options.sql).
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
                throw new HttpError(404, `Ekstra bu ürüne bağlı değil veya bulunamadı (ExtraProductId: ${extra.ExtraProductId}, ProductId: ${item.ProductId})`);
            }

            const extraProduct = extraResult.recordset[0];
            if (!extraProduct.IsActive) {
                throw new HttpError(400, `Ekstra şu anda aktif değil (ExtraProductId: ${extra.ExtraProductId})`);
            }

            const extraUnitPrice = Number(extraProduct.Price);
            unitPrice += extraUnitPrice * extra.Quantity;
            resolvedExtras.push({ ExtraProductId: extra.ExtraProductId, Quantity: extra.Quantity, UnitPrice: extraUnitPrice });
        }

        // Şuruplar — Ekstralar ile birebir aynı mantık (ProductSyrups üzerinden
        // bu ürüne bağlı+etkin olması şart).
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
                throw new HttpError(404, `Şurup bu ürüne bağlı değil veya bulunamadı (SyrupProductId: ${syrup.SyrupProductId}, ProductId: ${item.ProductId})`);
            }

            const syrupProduct = syrupResult.recordset[0];
            if (!syrupProduct.IsActive) {
                throw new HttpError(400, `Şurup şu anda aktif değil (SyrupProductId: ${syrup.SyrupProductId})`);
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

        totalAmount += unitPrice * item.Quantity;
    }

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

    // Masa 'Empty' durumundaysa siparişle birlikte 'Occupied' olur.
    // 'Reserved' durumunu ezmez (rezervasyonlu masada da sipariş açılabilir,
    // ör. misafir gelip oturdu ama rezervasyon henüz elle kapatılmadı).
    await new sql.Request(transaction)
        .input('TableId', sql.Int, TableId)
        .query(`UPDATE Tables SET Status = 'Occupied' WHERE TableId = @TableId AND Status = 'Empty'`);

    // Bu masada bekleyen Active rezervasyon(lar) varsa "Seated" olarak
    // kapatılır — misafir zaten oturup sipariş verdiği için rezervasyon
    // artık "yaklaşan" gibi görünmemeli (bkz. controllers/reservationController.js).
    await new sql.Request(transaction)
        .input('TableId', sql.Int, TableId)
        .query(`UPDATE Reservations SET Status = 'Seated' WHERE TableId = @TableId AND Status = 'Active'`);

    const lowStockWarnings = [];

    for (const item of validatedItems) {
        const insertedDetail = await new sql.Request(transaction)
            .input('OrderId', sql.Int, newOrderId)
            .input('ProductId', sql.Int, item.ProductId)
            .input('Quantity', sql.Int, item.Quantity)
            .input('UnitPrice', sql.Decimal(10, 2), item.UnitPrice)
            .input('VariantId', sql.Int, item.VariantId)
            .input('Note', sql.NVarChar, item.Note)
            .query('INSERT INTO OrderDetails (OrderId, ProductId, Quantity, UnitPrice, VariantId, Note) OUTPUT INSERTED.OrderDetailsId VALUES (@OrderId, @ProductId, @Quantity, @UnitPrice, @VariantId, @Note)');

        const orderDetailsId = insertedDetail.recordset[0].OrderDetailsId;

        // Reçetesi varsa hammaddeler, yoksa ürünün kendisi düşülür (BOM-farkında)
        const warnings = await deductStockForItem(transaction, item.ProductId, item.Quantity);
        lowStockWarnings.push(...warnings);

        // Seçilen ekstraları kaydet + stoktan düş (adet x kalemin Quantity'si)
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

        // Seçilen şurupları kaydet + stoktan düş (Ekstralar ile aynı mantık)
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

    return { order: orderResult.recordset[0], totalAmount, lowStockWarnings };
}

module.exports = { validateOrderItemsShape, buildOrderInTransaction };
