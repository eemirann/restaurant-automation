const bcrypt = require('bcryptjs');
const { sql, connectDB } = require('../config/db');
const { emitCustomerRequests } = require('../config/socket');
const { isOpenNow } = require('../utils/businessHours');

const PIN_REGEX = /^\d{4,6}$/;

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
// GET /api/public/menu/:qrToken/campaigns — QR menü üstündeki karüselde
// gösterilecek AKTİF kampanyalar (IsActive=1 VE StartAt<=şimdi<=EndAt).
// CampaignType='Combo' olanlarda ComboItems (bileşen ürün adı/adedi) de
// döner ki müşteri combo detay modalında görebilsin (bkz. musteri-menu:
// CampaignCarousel.jsx).
// ============================================================
async function getPublicMenuCampaigns(req, res) {
    const { qrToken } = req.params;

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        const campaignsResult = await pool.request().query(`
            SELECT c.CampaignId, c.Title, c.Description, c.ImageUrl, c.CampaignType, c.ComboOfferId,
                   co.Name AS ComboName, co.Price AS ComboPrice
            FROM Campaigns c
            LEFT JOIN ComboOffers co ON co.ComboOfferId = c.ComboOfferId
            WHERE c.IsActive = 1 AND c.StartAt <= GETDATE() AND c.EndAt >= GETDATE()
                  AND (c.RecurringDailyStartTime IS NULL OR CAST(GETDATE() AS TIME) BETWEEN c.RecurringDailyStartTime AND c.RecurringDailyEndTime)
            ORDER BY c.DisplayOrder ASC, c.CampaignId DESC
        `);

        const campaigns = campaignsResult.recordset;
        const comboIds = campaigns.filter((c) => c.ComboOfferId).map((c) => c.ComboOfferId);

        let itemsByComboId = new Map();
        if (comboIds.length > 0) {
            const itemsResult = await pool.request().query(`
                SELECT ci.ComboOfferId, ci.ProductId, p.Name AS ProductName, ci.Quantity
                FROM ComboOfferItems ci
                JOIN Products p ON p.ProductId = ci.ProductId
                WHERE ci.ComboOfferId IN (${comboIds.join(',')})
            `);
            for (const row of itemsResult.recordset) {
                if (!itemsByComboId.has(row.ComboOfferId)) itemsByComboId.set(row.ComboOfferId, []);
                itemsByComboId.get(row.ComboOfferId).push(row);
            }
        }

        return res.status(200).json(
            campaigns.map((c) => ({ ...c, ComboItems: c.ComboOfferId ? (itemsByComboId.get(c.ComboOfferId) || []) : [] }))
        );
    } catch (err) {
        console.error('Müşteri menüsü kampanyaları getirilirken hata:', err);
        return res.status(500).json({ error: 'Kampanyalar getirilemedi' });
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
    const { Items, Note, Combos, Username, TipAmount } = req.body || {};

    const hasItems = Items && Array.isArray(Items) && Items.length > 0;
    const hasCombos = Combos && Array.isArray(Combos) && Combos.length > 0;
    if (!hasItems && !hasCombos) {
        return res.status(400).json({ error: 'En az bir ürün (Items) veya combo (Combos) zorunludur' });
    }

    for (const item of (Items || [])) {
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
    for (const combo of (Combos || [])) {
        if (typeof combo.ComboOfferId !== 'number' || !Number.isInteger(combo.Quantity) || combo.Quantity <= 0) {
            return res.status(400).json({ error: 'Her combo için geçerli ComboOfferId ve pozitif tam sayı Quantity giriniz' });
        }
    }
    if (Username !== undefined && Username !== null && (typeof Username !== 'string' || Username.trim().length > 50)) {
        return res.status(400).json({ error: 'Username en fazla 50 karakter olabilen bir metin olmalıdır' });
    }
    // Hafif ön-doğrulama (şekil) — asıl doğrulama (negatif olamaz, ara
    // toplamın en fazla %50'si) onay anında utils/orderBuilder.js
    // resolveTipAmount() içinde, gerçek fiyatlar hesaplandıktan sonra yapılır.
    if (TipAmount !== undefined && TipAmount !== null && (typeof TipAmount !== 'number' || Number.isNaN(TipAmount) || TipAmount < 0)) {
        return res.status(400).json({ error: 'TipAmount negatif olmayan bir sayı olmalıdır' });
    }

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        // KAPALI SAATTE SİPARİŞ ENGELLENİR — YETKİLİ (sunucu saatiyle) kontrol.
        // musteri-menu istemci tarafında da aynı hesabı yapıp banner gösterip
        // gönder düğmesini kapatıyor (bkz. musteri-menu/src/utils/businessHours.js),
        // ama o SADECE görsel geri bildirimdir — istemci saati/önbelleklenmiş
        // sayfa manipüle edilebilir. Gerçek engel burada.
        const hoursResult = await pool.request().query(`SELECT TOP 1 OpeningTime, ClosingTime FROM AppSettings ORDER BY AppSettingsId ASC`);
        const hoursRow = hoursResult.recordset[0];
        if (hoursRow && !isOpenNow(hoursRow.OpeningTime, hoursRow.ClosingTime)) {
            return res.status(403).json({ error: 'Restoran şu anda kapalı, sipariş alınamıyor.' });
        }

        // Hafif ön-doğrulama: ürün gerçekten var mı, aktif ve satılabilir bir
        // menü ürünü mü (hammadde/ekstra/şurup değil). Fiyat/ekstra-uygunluk
        // gibi asıl (yetkili) doğrulama personel onayladığında, mevcut sipariş
        // oluşturma akışıyla YENİDEN yapılır — burada sadece hızlı geri bildirim
        // için kontrol ediyoruz (bkz. dosya başındaki güvenlik notu).
        for (const item of (Items || [])) {
            const productResult = await pool.request()
                .input('ProductId', sql.Int, item.ProductId)
                .query(`SELECT ProductId FROM Products WHERE ProductId = @ProductId AND IsActive = 1 AND IsRawMaterial = 0 AND IsExtra = 0 AND IsSyrup = 0`);
            if (productResult.recordset.length === 0) {
                return res.status(404).json({ error: `Ürün bulunamadı veya artık satılmıyor (ProductId: ${item.ProductId})` });
            }
        }
        // Aynı hafif ön-doğrulama combo'lar için — asıl doğrulama (tarih
        // aralığı dahil) onay anında utils/orderBuilder.js'te tekrar yapılır.
        for (const combo of (Combos || [])) {
            const comboResult = await pool.request()
                .input('ComboOfferId', sql.Int, combo.ComboOfferId)
                .query(`SELECT ComboOfferId FROM ComboOffers WHERE ComboOfferId = @ComboOfferId AND IsActive = 1`);
            if (comboResult.recordset.length === 0) {
                return res.status(404).json({ error: `Combo bulunamadı veya artık aktif değil (ComboOfferId: ${combo.ComboOfferId})` });
            }
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const requestResult = await new sql.Request(transaction)
                .input('TableId', sql.Int, table.TableId)
                .input('Note', sql.NVarChar(500), Note || null)
                .input('Username', sql.NVarChar(50), Username?.trim() || null)
                .input('CombosJson', sql.NVarChar(sql.MAX), hasCombos ? JSON.stringify(Combos) : null)
                .input('TipAmount', sql.Decimal(10, 2), typeof TipAmount === 'number' ? TipAmount : null)
                .query(`
                    INSERT INTO CustomerOrderRequests (TableId, Note, Username, CombosJson, TipAmount)
                    OUTPUT INSERTED.CustomerOrderRequestId, INSERTED.CreatedAt
                    VALUES (@TableId, @Note, @Username, @CombosJson, @TipAmount)
                `);

            const requestId = requestResult.recordset[0].CustomerOrderRequestId;

            for (const item of (Items || [])) {
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
// GET /api/public/menu/:qrToken/loyalty/:username — müşteri kendi puan
// bakiyesini görsün. QR linkin kendisi zaten "bu masadasın" kanıtı
// (qrToken doğrulanır), Username case-insensitive aranır (Customers
// collation'ı, bkz. migrations/2026_08_01_campaigns_and_loyalty.sql).
// ============================================================
async function getPublicMenuLoyaltyBalance(req, res) {
    const { qrToken, username } = req.params;

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        const customerResult = await pool.request()
            .input('Username', sql.NVarChar(50), username)
            .query(`SELECT Username, LoyaltyPoints FROM Customers WHERE Username = @Username`);

        if (customerResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Bu kullanıcı adında bir müşteri kaydı yok' });
        }

        return res.status(200).json(customerResult.recordset[0]);
    } catch (err) {
        console.error('Müşteri puan bakiyesi getirilirken hata:', err);
        return res.status(500).json({ error: 'Puan bakiyesi getirilemedi' });
    }
}

// ============================================================
// POST /api/public/menu/:qrToken/loyalty/register — sadakat hesabı aç.
// Body: { Username, Pin } — Pin 4-6 haneli rakam, bcrypt ile hashlenir.
// Opsiyoneldir: müşteri istemezse checkout'ta hâlâ PIN'siz Username
// girip puan kazanabilir (approveCustomerOrderRequest zaten find-or-
// create yapıyor) — bu uç sadece "cihazda hatırlanan" bir hesap açmak
// isteyenler için.
// ============================================================
async function registerLoyaltyAccount(req, res) {
    const { qrToken } = req.params;
    const { Username, Pin } = req.body || {};

    if (!Username || typeof Username !== 'string' || !Username.trim() || Username.trim().length > 50) {
        return res.status(400).json({ error: 'Geçerli bir kullanıcı adı girin (en fazla 50 karakter).' });
    }
    if (!Pin || typeof Pin !== 'string' || !PIN_REGEX.test(Pin)) {
        return res.status(400).json({ error: 'PIN 4-6 haneli rakamlardan oluşmalıdır.' });
    }

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        const username = Username.trim();
        const existing = await pool.request()
            .input('Username', sql.NVarChar(50), username)
            .query(`SELECT CustomerId, Pin FROM Customers WHERE Username = @Username`);

        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış. Zaten hesabın varsa giriş yapabilirsin.' });
        }

        const pinHash = await bcrypt.hash(Pin, 10);
        const result = await pool.request()
            .input('Username', sql.NVarChar(50), username)
            .input('Pin', sql.NVarChar(255), pinHash)
            .query(`
                INSERT INTO Customers (Username, Pin, LoyaltyPoints)
                OUTPUT INSERTED.Username, INSERTED.LoyaltyPoints
                VALUES (@Username, @Pin, 0)
            `);

        return res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Sadakat hesabı oluşturulurken hata:', err);
        return res.status(500).json({ error: 'Hesap oluşturulamadı' });
    }
}

// ============================================================
// POST /api/public/menu/:qrToken/loyalty/login — PIN ile giriş.
// Body: { Username, Pin }. PIN'i olmayan (checkout'tan otomatik açılmış)
// hesaplar bu yolla giriş yapamaz — aynı genel hata mesajıyla reddedilir
// (hesap var/yok, PIN yanlış/eksik ayrımı sızdırılmaz).
// ============================================================
async function loginLoyaltyAccount(req, res) {
    const { qrToken } = req.params;
    const { Username, Pin } = req.body || {};

    if (!Username || typeof Username !== 'string' || !Username.trim() || !Pin || typeof Pin !== 'string') {
        return res.status(400).json({ error: 'Kullanıcı adı ve PIN zorunludur.' });
    }

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        const result = await pool.request()
            .input('Username', sql.NVarChar(50), Username.trim())
            .query(`SELECT Username, Pin, LoyaltyPoints FROM Customers WHERE Username = @Username`);

        if (result.recordset.length === 0 || !result.recordset[0].Pin) {
            return res.status(401).json({ error: 'Kullanıcı adı veya PIN hatalı.' });
        }

        const customer = result.recordset[0];
        const matches = await bcrypt.compare(Pin, customer.Pin);
        if (!matches) {
            return res.status(401).json({ error: 'Kullanıcı adı veya PIN hatalı.' });
        }

        return res.status(200).json({ Username: customer.Username, LoyaltyPoints: customer.LoyaltyPoints });
    } catch (err) {
        console.error('Sadakat girişi sırasında hata:', err);
        return res.status(500).json({ error: 'Giriş yapılamadı' });
    }
}

// ============================================================
// POST /api/public/menu/:qrToken/feedback — 3 kategoride (Lezzet/Hizmet/
// Temizlik) 1-3 arası memnuniyet anketi. Anonim, oturum/ziyaret sınırı
// YOK — bir "memnuniyet nabzı", aynı masada birden fazla kez gönderilebilir.
// Body: { TasteRating, ServiceRating, CleanlinessRating } (1-3)
// ============================================================
function isValidRating(v) {
    return Number.isInteger(v) && v >= 1 && v <= 3;
}

async function createFeedback(req, res) {
    const { qrToken } = req.params;
    const { TasteRating, ServiceRating, CleanlinessRating } = req.body || {};

    if (!isValidRating(TasteRating) || !isValidRating(ServiceRating) || !isValidRating(CleanlinessRating)) {
        return res.status(400).json({ error: 'TasteRating, ServiceRating ve CleanlinessRating 1-3 arası tam sayı olmalıdır' });
    }

    try {
        const pool = await connectDB();
        const table = await resolveTableByToken(pool, qrToken);
        if (!table) {
            return res.status(404).json({ error: 'Masa bulunamadı. QR kodu tekrar okutmayı deneyin.' });
        }

        await pool.request()
            .input('TableId', sql.Int, table.TableId)
            .input('TasteRating', sql.Int, TasteRating)
            .input('ServiceRating', sql.Int, ServiceRating)
            .input('CleanlinessRating', sql.Int, CleanlinessRating)
            .query(`
                INSERT INTO Feedback (TableId, TasteRating, ServiceRating, CleanlinessRating)
                VALUES (@TableId, @TasteRating, @ServiceRating, @CleanlinessRating)
            `);

        return res.status(201).json({ message: 'Değerlendirmeniz için teşekkürler.' });
    } catch (err) {
        console.error('Müşteri değerlendirmesi kaydedilirken hata:', err);
        return res.status(500).json({ error: 'Değerlendirme kaydedilemedi' });
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
    getPublicMenuCampaigns,
    getPublicMenuProductOptions,
    createCustomerOrderRequest,
    createServiceRequest,
    getPublicMenuStatus,
    getPublicMenuLoyaltyBalance,
    registerLoyaltyAccount,
    loginLoyaltyAccount,
    createFeedback,
};
