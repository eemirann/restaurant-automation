const { sql } = require('../config/db');
const { deductStockForItem } = require('./stockDeduction');
const { HttpError } = require('./httpError');
const { toStockUnit, getPorsiyonUnitId } = require('./unitConversion');

// ============================================================
// Sipariş kalemlerinin (Items) şekil doğrulaması. Fiyat/stok/ekstra
// gibi VERİTABANINA bağlı doğrulamalar burada YAPILMAZ — sadece
// gövdenin (body) biçimi kontrol edilir. Hem createOrder (HTTP) hem
// de müşteri QR siparişi onaylanırken (customerOrderController)
// kullanılır.
// ============================================================
function validateOrderItemsShape(TableId, UserId, Items, Combos) {
    const hasItems = Items && Items.length > 0;
    const hasCombos = Combos && Combos.length > 0;
    if (!TableId || !UserId || (!hasItems && !hasCombos)) {
        throw new HttpError(400, 'Masa, kullanıcı ve en az bir ürün veya combo zorunludur');
    }

    for (const item of (Items || [])) {
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

    validateCombosShape(Combos);
}

// ============================================================
// Combos şekil doğrulaması ([{ComboOfferId, Quantity}]) — Items ile
// aynı ilke: sadece gövde biçimi kontrol edilir, DB'ye bağlı doğrulama
// (aktif mi, tarih aralığında mı, bileşen ürünler satılabilir mi)
// resolveCombo() içinde, transaction açıkken yapılır.
// ============================================================
function validateCombosShape(Combos) {
    if (Combos === undefined || Combos === null) return;
    if (!Array.isArray(Combos)) {
        throw new HttpError(400, 'Combos gönderiliyorsa bir dizi olmalıdır');
    }
    for (const combo of Combos) {
        if (typeof combo.ComboOfferId !== 'number' || !Number.isInteger(combo.Quantity) || combo.Quantity <= 0) {
            throw new HttpError(400, 'Her combo için geçerli ComboOfferId ve pozitif tam sayı Quantity giriniz');
        }
    }
}

// ============================================================
// Bir combo siparişini (ComboOfferId + istenen adet) doğrular ve
// bileşenlerini (her biri gerçek bir ürün) döner. GÜVENLİK: fiyat
// TAMAMEN ComboOffers.Price'tan gelir, client'tan asla kabul edilmez
// (Items'taki UnitPrice gibi).
// ============================================================
async function resolveCombo(transaction, combo) {
    const comboResult = await new sql.Request(transaction)
        .input('ComboOfferId', sql.Int, combo.ComboOfferId)
        .query(`SELECT ComboOfferId, Name, Price, IsActive FROM ComboOffers WHERE ComboOfferId = @ComboOfferId`);

    if (comboResult.recordset.length === 0) {
        throw new HttpError(404, `Combo bulunamadı (ComboOfferId: ${combo.ComboOfferId})`);
    }
    const comboOffer = comboResult.recordset[0];
    if (!comboOffer.IsActive) {
        throw new HttpError(400, `Combo artık aktif değil (ComboOfferId: ${combo.ComboOfferId})`);
    }

    // Combo'nun en az bir AKTİF kampanya tarafından (tarih aralığı
    // dahilinde) sunuluyor olması şart — kampanya süresi dolmuşsa
    // (sepette kalmış bile olsa) sipariş onayında artık geçerli değildir.
    const activeCampaignResult = await new sql.Request(transaction)
        .input('ComboOfferId', sql.Int, combo.ComboOfferId)
        .query(`
            SELECT TOP 1 CampaignId FROM Campaigns
            WHERE ComboOfferId = @ComboOfferId AND IsActive = 1 AND StartAt <= GETDATE() AND EndAt >= GETDATE()
                  AND (RecurringDailyStartTime IS NULL OR CAST(GETDATE() AS TIME) BETWEEN RecurringDailyStartTime AND RecurringDailyEndTime)
        `);
    if (activeCampaignResult.recordset.length === 0) {
        throw new HttpError(400, `Bu kampanya artık geçerli değil (ComboOfferId: ${combo.ComboOfferId})`);
    }

    const itemsResult = await new sql.Request(transaction)
        .input('ComboOfferId', sql.Int, combo.ComboOfferId)
        .query(`
            SELECT ci.ProductId, ci.Quantity, p.IsActive, p.IsAvailable
            FROM ComboOfferItems ci
            JOIN Products p ON p.ProductId = ci.ProductId
            WHERE ci.ComboOfferId = @ComboOfferId
        `);

    if (itemsResult.recordset.length === 0) {
        throw new HttpError(400, `Combo'nun hiç bileşeni yok (ComboOfferId: ${combo.ComboOfferId})`);
    }

    for (const row of itemsResult.recordset) {
        if (!row.IsActive) {
            throw new HttpError(400, `Combo bileşeni artık aktif değil (ProductId: ${row.ProductId})`);
        }
        if (!row.IsAvailable) {
            throw new HttpError(400, `Combo bileşeni şu anda tükendi/satışta değil (ProductId: ${row.ProductId})`);
        }
    }

    return {
        comboOfferId: comboOffer.ComboOfferId,
        comboQuantity: combo.Quantity,
        price: Number(comboOffer.Price),
        components: itemsResult.recordset.map((row) => ({ productId: row.ProductId, quantityPerCombo: row.Quantity })),
    };
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
// ============================================================
// Bahşiş doğrulaması — GÜVENLİK: negatif olamaz, ara toplamın (Items+Combos
// tutarı, bahşiş HARİÇ) en fazla %50'si kadar olabilir (mantıksız büyük
// bahşiş bir veri girişi hatası/kötüye kullanım olabilir). Müşterinin QR
// menüden seçtiği tutar sunucuda burada YENİDEN doğrulanır — client'tan
// gelen hiçbir değer doğrudan güvenilmez (bkz. dosya başındaki genel ilke).
// ============================================================
const MAX_TIP_RATIO = 0.5;

function resolveTipAmount(TipAmount, subtotal) {
    if (TipAmount === undefined || TipAmount === null) return 0;
    if (typeof TipAmount !== 'number' || Number.isNaN(TipAmount) || TipAmount < 0) {
        throw new HttpError(400, 'TipAmount negatif olamayan bir sayı olmalıdır');
    }
    const maxTip = subtotal * MAX_TIP_RATIO;
    if (TipAmount > maxTip) {
        throw new HttpError(400, `TipAmount çok yüksek (ara toplamın en fazla %${MAX_TIP_RATIO * 100}'i kadar olabilir)`);
    }
    return TipAmount;
}

async function buildOrderInTransaction(transaction, { TableId, UserId, Items, Note, Combos, TipAmount }) {
    validateOrderItemsShape(TableId, UserId, Items, Combos);

    const validatedItems = [];
    let totalAmount = 0;

    for (const item of (Items || [])) {
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
            // Şuruplarla BİREBİR AYNI mantık (bkz. utils/unitConversion.js).
            const porsiyonUnitIdForExtra = await getPorsiyonUnitId(transaction);
            const stockUnitsPerServing = await toStockUnit(transaction, extra.ExtraProductId, 1, porsiyonUnitIdForExtra);
            resolvedExtras.push({ ExtraProductId: extra.ExtraProductId, Quantity: extra.Quantity, UnitPrice: extraUnitPrice, StockUnitsPerServing: stockUnitsPerServing });
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
            // Müşterinin/garsonun seçtiği "1x, 2x..." adet PORSİYON birimindedir
            // (bkz. utils/unitConversion.js) — Birim Dönüşüm Sistemi, ürünün Stok
            // Birimine (Products.StockUnitId, ör. ml) göre gerçek stok tüketimini
            // hesaplar. Ürün için StockUnitId hiç ayarlanmamışsa faktör 1'dir
            // (eski davranış, geriye dönük uyumlu).
            const porsiyonUnitId = await getPorsiyonUnitId(transaction);
            const stockUnitsPerServing = (await toStockUnit(transaction, syrup.SyrupProductId, 1, porsiyonUnitId));
            resolvedSyrups.push({ SyrupProductId: syrup.SyrupProductId, Quantity: syrup.Quantity, UnitPrice: syrupUnitPrice, StockUnitsPerServing: stockUnitsPerServing });
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

    // Combo'lar — her biri ComboOffers.Price (sabit) üzerinden, kendi
    // bileşenleri (gerçek ürünler) çözülerek doğrulanır. Fiyatın kendisi
    // Items'taki gibi client'tan asla kabul edilmez.
    const validatedCombos = [];
    for (const combo of (Combos || [])) {
        const resolved = await resolveCombo(transaction, combo);
        validatedCombos.push(resolved);
        totalAmount += resolved.price * resolved.comboQuantity;
    }

    const resolvedTipAmount = resolveTipAmount(TipAmount, totalAmount);

    const orderResult = await new sql.Request(transaction)
        .input('TableId', sql.Int, TableId)
        .input('UserId', sql.Int, UserId)
        .input('TotalAmount', sql.Decimal(10, 2), totalAmount)
        .input('Note', sql.NVarChar, Note || null)
        .input('TipAmount', sql.Decimal(10, 2), resolvedTipAmount)
        .query(`DECLARE @InsertedOrders TABLE (
                OrderId INT, TableId INT, UserId INT, TotalAmount DECIMAL(10,2),
                Status NVARCHAR(50), Note NVARCHAR(MAX), CreatedAt DATETIME, TipAmount DECIMAL(10,2));
                INSERT INTO Orders (TableId, UserId, TotalAmount, Note, TipAmount) OUTPUT INSERTED.OrderId, INSERTED.TableId, INSERTED.UserId,
                INSERTED.TotalAmount, INSERTED.Status,
                INSERTED.Note, INSERTED.CreatedAt, INSERTED.TipAmount INTO @InsertedOrders (OrderId, TableId, UserId, TotalAmount, Status, Note, CreatedAt, TipAmount) VALUES (@TableId, @UserId, @TotalAmount, @Note, @TipAmount);
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

            const extraWarnings = await deductStockForItem(transaction, extra.ExtraProductId, extra.Quantity * item.Quantity * (extra.StockUnitsPerServing ?? 1));
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

            const syrupWarnings = await deductStockForItem(transaction, syrup.SyrupProductId, syrup.Quantity * item.Quantity * (syrup.StockUnitsPerServing ?? 1));
            lowStockWarnings.push(...syrupWarnings);
        }
    }

    // Combo bileşenleri — her biri KENDİ OrderDetail satırı (KDS/mutfak
    // gerçek ürünleri görsün, stok/BOM normal düşsün). Fiyat satırlara
    // değil combo'nun sabit Price'ına eşitlenecek şekilde dağıtılır: ilk
    // bileşen satırı toplam combo gelirini (price * comboQuantity) taşır,
    // diğer bileşen satırları UnitPrice=0'dır — böylece Quantity*UnitPrice
    // toplamı satır bazında her zaman tam olarak combo.Price * comboQuantity
    // eder, çift sayım olmaz.
    for (const combo of validatedCombos) {
        const totalComboRevenue = combo.price * combo.comboQuantity;

        for (let i = 0; i < combo.components.length; i++) {
            const component = combo.components[i];
            const quantity = component.quantityPerCombo * combo.comboQuantity;
            const unitPrice = i === 0 ? totalComboRevenue / quantity : 0;

            // Combo bileşenlerinde ekstra/şurup desteklenmiyor (kapsam dışı),
            // bu yüzden OUTPUT edilen OrderDetailsId'ye burada ihtiyaç yok.
            await new sql.Request(transaction)
                .input('OrderId', sql.Int, newOrderId)
                .input('ProductId', sql.Int, component.productId)
                .input('Quantity', sql.Int, quantity)
                .input('UnitPrice', sql.Decimal(10, 2), unitPrice)
                .input('ComboOfferId', sql.Int, combo.comboOfferId)
                .query('INSERT INTO OrderDetails (OrderId, ProductId, Quantity, UnitPrice, ComboOfferId) VALUES (@OrderId, @ProductId, @Quantity, @UnitPrice, @ComboOfferId)');

            const warnings = await deductStockForItem(transaction, component.productId, quantity);
            lowStockWarnings.push(...warnings);
        }
    }

    return { order: orderResult.recordset[0], totalAmount, lowStockWarnings };
}

module.exports = { validateOrderItemsShape, buildOrderInTransaction };
