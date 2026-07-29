const { sql, connectDB } = require('../config/db');
const { emitCustomerRequests } = require('../config/socket');

const SERVICE_REQUEST_TYPES = ['CallWaiter', 'RequestBill', 'AskForWater', 'NeedNapkins', 'ExtraCutlery'];

// ============================================================
// Müşteri QR menüsü — KİMLİK DOĞRULAMASIZ (anonim) uçlar.
// Erişim tamamen Tables.QrToken'a bağlıdır: token bilinmeden hiçbir
// masaya ait veri okunamaz/yazılamaz. Rate limit ile korunur
// (bkz. middleware/rateLimiters.js, routes/publicMenu.js).
//
// GÜVENLİK: Bu uçlar hiçbir zaman doğrudan Orders'a yazmaz. Müşterinin
// gönderdiği sipariş CustomerOrderRequests'e "Pending" olarak düşer;
// personel onaylayana kadar gerçek bir sipariş oluşmaz (bkz.
// controllers/customerOrderController.js: approveCustomerOrderRequest).
// ============================================================

async function resolveTableByToken(pool, qrToken) {
    const result = await pool.request()
        .input('QrToken', sql.NVarChar(64), qrToken)
        .query(`SELECT TableId, TableNumber, Area, Status FROM Tables WHERE QrToken = @QrToken`);
    return result.recordset[0] || null;
}

// ============================================================
// GET /api/public/menu/:qrToken — masa bilgisi + aktif menü
// ============================================================
async function getPublicMenu(req, res) {
    const { qrToken } = req.params;

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);

        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        const categoriesResult = await pool.request()
            .query(`SELECT CategoryId, Name FROM Categories WHERE IsActive = 1 ORDER BY Name ASC`);

        const productsResult = await pool.request()
            .query(`
                SELECT ProductId, Name, Description, Price, CategoryId, ImageUrl, IsPopular, StockCount
                FROM Products
                WHERE IsActive = 1 AND IsRawMaterial = 0 AND IsExtra = 0 AND IsSyrup = 0
                ORDER BY Name ASC
            `);

        return res.status(200).json({
            table: { TableNumber: table.TableNumber, Area: table.Area },
            categories: categoriesResult.recordset,
            products: productsResult.recordset,
        });
    } catch (err) {
        console.error('Müşteri menüsü getirilirken hata:', err);
        return res.status(500).json({ error: 'Menü getirilemedi' });
    }
}

// ============================================================
// GET /api/public/menu/:qrToken/options/:productId — bir ürüne bağlı
// ekstra/şurup seçenekleri (mevcut personel akışıyla aynı endpoint
// mantığı: productController.getProductOrderOptions ile birebir aynı
// sorgu — sadece IsEnabled+IsActive olanlar).
// ============================================================
async function getPublicMenuProductOptions(req, res) {
    const { qrToken, productId } = req.params;

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        const extrasResult = await pool.request()
            .input('ProductId', sql.Int, productId)
            .query(`
                SELECT p.ProductId, p.Name, p.Price
                FROM ProductExtras pe
                JOIN Products p ON p.ProductId = pe.ExtraProductId
                WHERE pe.ProductId = @ProductId AND pe.IsEnabled = 1 AND p.IsActive = 1
                ORDER BY pe.DisplayOrder ASC, p.Name ASC
            `);

        const syrupsResult = await pool.request()
            .input('ProductId', sql.Int, productId)
            .query(`
                SELECT p.ProductId, p.Name, p.Price
                FROM ProductSyrups ps
                JOIN Products p ON p.ProductId = ps.SyrupProductId
                WHERE ps.ProductId = @ProductId AND ps.IsEnabled = 1 AND p.IsActive = 1
                ORDER BY ps.DisplayOrder ASC, p.Name ASC
            `);

        return res.status(200).json({ extras: extrasResult.recordset, syrups: syrupsResult.recordset });
    } catch (err) {
        console.error('Müşteri ürün seçenekleri getirilirken hata:', err);
        return res.status(500).json({ error: 'Seçenekler getirilemedi' });
    }
}

// ============================================================
// POST /api/public/menu/:qrToken/order — sipariş İSTEĞİ oluştur
// (henüz gerçek sipariş DEĞİL — personel onayı bekler)
// Body: { Items: [{ ProductId, Quantity, VariantId?, Note?, Extras?, Syrups? }], Note? }
// ============================================================
async function createCustomerOrderRequest(req, res) {
    const { qrToken } = req.params;
    const { Items, Note } = req.body || {};

    if (!Items || !Array.isArray(Items) || Items.length === 0) {
        return res.status(400).json({ error: 'En az bir ürün içeren Items dizisi zorunludur' });
    }

    for (const item of Items) {
        if (typeof item.ProductId !== 'number' || !Number.isInteger(item.Quantity) || item.Quantity <= 0) {
            return res.status(400).json({ error: 'Her ürün için geçerli ProductId ve pozitif tam sayı Quantity giriniz' });
        }
        if (item.Extras !== undefined && !Array.isArray(item.Extras)) {
            return res.status(400).json({ error: 'Extras gönderiliyorsa bir dizi olmalıdır' });
        }
        if (item.Syrups !== undefined && !Array.isArray(item.Syrups)) {
            return res.status(400).json({ error: 'Syrups gönderiliyorsa bir dizi olmalıdır' });
        }
    }

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        // Hafif ön-doğrulama: ürün gerçekten var mı, aktif ve satılabilir bir
        // menü ürünü mü (hammadde/ekstra/şurup değil). Fiyat/ekstra-uygunluk
        // gibi asıl (yetkili) doğrulama personel onayladığında, mevcut sipariş
        // oluşturma akışıyla YENİDEN yapılır — burada sadece hızlı geri bildirim
        // için kontrol ediyoruz (bkz. dosya başındaki güvenlik notu).
        for (const item of Items) {
            const productResult = await pool.request()
                .input('ProductId', sql.Int, item.ProductId)
                .query(`SELECT ProductId FROM Products WHERE ProductId = @ProductId AND IsActive = 1 AND IsRawMaterial = 0 AND IsExtra = 0 AND IsSyrup = 0`);
            if (productResult.recordset.length === 0) {
                return res.status(404).json({ error: `Ürün bulunamadı veya artık satılmıyor (ProductId: ${item.ProductId})` });
            }
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const requestResult = await new sql.Request(transaction)
                .input('TableId', sql.Int, table.TableId)
                .input('Note', sql.NVarChar(500), Note || null)
                .query(`
                    INSERT INTO CustomerOrderRequests (TableId, Note)
                    OUTPUT INSERTED.CustomerOrderRequestId, INSERTED.CreatedAt
                    VALUES (@TableId, @Note)
                `);

            const requestId = requestResult.recordset[0].CustomerOrderRequestId;

            for (const item of Items) {
                await new sql.Request(transaction)
                    .input('CustomerOrderRequestId', sql.Int, requestId)
                    .input('ProductId', sql.Int, item.ProductId)
                    .input('Quantity', sql.Int, item.Quantity)
                    .input('VariantId', sql.Int, item.VariantId || null)
                    .input('Note', sql.NVarChar(255), item.Note || null)
                    .input('ExtrasJson', sql.NVarChar(sql.MAX), item.Extras?.length ? JSON.stringify(item.Extras) : null)
                    .input('SyrupsJson', sql.NVarChar(sql.MAX), item.Syrups?.length ? JSON.stringify(item.Syrups) : null)
                    .query(`
                        INSERT INTO CustomerOrderRequestItems (CustomerOrderRequestId, ProductId, Quantity, VariantId, Note, ExtrasJson, SyrupsJson)
                        VALUES (@CustomerOrderRequestId, @ProductId, @Quantity, @VariantId, @Note, @ExtrasJson, @SyrupsJson)
                    `);
            }

            await transaction.commit();

            emitCustomerRequests({ type: 'order', tableId: table.TableId, tableNumber: table.TableNumber, requestId });

            return res.status(201).json({
                message: 'Sipariş isteğiniz alındı, personel onayladığında hazırlanmaya başlayacak.',
                requestId,
            });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Müşteri sipariş isteği oluşturulurken hata:', err);
        return res.status(500).json({ error: 'Sipariş isteği gönderilemedi' });
    }
}

// ============================================================
// POST /api/public/menu/:qrToken/request — hızlı hizmet isteği
// (garson çağır / hesap / su / peçete / çatal-bıçak)
// Body: { Type }
// ============================================================
async function createServiceRequest(req, res) {
    const { qrToken } = req.params;
    const { Type } = req.body || {};

    if (!Type || !SERVICE_REQUEST_TYPES.includes(Type)) {
        return res.status(400).json({ error: `Type şunlardan biri olmalı: ${SERVICE_REQUEST_TYPES.join(', ')}` });
    }

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        // Aynı tipte zaten bekleyen bir istek varsa yenisini oluşturma —
        // spam'i (ör. "garson çağır"a arka arkaya basmak) önler, mevcut
        // isteği döner.
        const existing = await pool.request()
            .input('TableId', sql.Int, table.TableId)
            .input('Type', sql.NVarChar(20), Type)
            .query(`SELECT ServiceRequestId, CreatedAt FROM ServiceRequests WHERE TableId = @TableId AND Type = @Type AND Status = 'Pending'`);

        if (existing.recordset.length > 0) {
            return res.status(200).json({ message: 'Bu istek zaten personele iletildi, geliyorlar.', requestId: existing.recordset[0].ServiceRequestId, alreadyPending: true });
        }

        const result = await pool.request()
            .input('TableId', sql.Int, table.TableId)
            .input('Type', sql.NVarChar(20), Type)
            .query(`
                INSERT INTO ServiceRequests (TableId, Type)
                OUTPUT INSERTED.ServiceRequestId, INSERTED.CreatedAt
                VALUES (@TableId, @Type)
            `);

        emitCustomerRequests({ type: 'service', tableId: table.TableId, tableNumber: table.TableNumber, requestType: Type, requestId: result.recordset[0].ServiceRequestId });

        return res.status(201).json({ message: 'İsteğiniz personele iletildi.', requestId: result.recordset[0].ServiceRequestId });
    } catch (err) {
        console.error('Hizmet isteği oluşturulurken hata:', err);
        return res.status(500).json({ error: 'İstek gönderilemedi' });
    }
}

// ============================================================
// GET /api/public/menu/:qrToken/status — müşterinin son sipariş
// isteğinin durumu + masadaki bekleyen hizmet istekleri
// ============================================================
async function getPublicMenuStatus(req, res) {
    const { qrToken } = req.params;

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        const lastOrderResult = await pool.request()
            .input('TableId', sql.Int, table.TableId)
            .query(`
                SELECT TOP 1 CustomerOrderRequestId, Status, RejectionReason, ApprovedOrderId, CreatedAt
                FROM CustomerOrderRequests
                WHERE TableId = @TableId
                ORDER BY CustomerOrderRequestId DESC
            `);

        const pendingServiceResult = await pool.request()
            .input('TableId', sql.Int, table.TableId)
            .query(`
                SELECT ServiceRequestId, Type, CreatedAt
                FROM ServiceRequests
                WHERE TableId = @TableId AND Status = 'Pending'
                ORDER BY CreatedAt ASC
            `);

        return res.status(200).json({
            lastOrderRequest: lastOrderResult.recordset[0] || null,
            pendingServiceRequests: pendingServiceResult.recordset,
        });
    } catch (err) {
        console.error('Müşteri durum bilgisi getirilirken hata:', err);
        return res.status(500).json({ error: 'Durum bilgisi getirilemedi' });
    }
}

module.exports = {
    getPublicMenu,
    getPublicMenuProductOptions,
    createCustomerOrderRequest,
    createServiceRequest,
    getPublicMenuStatus,
};
