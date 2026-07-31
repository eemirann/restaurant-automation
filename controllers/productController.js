const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

// Not: Hammadde (IsRawMaterial=1), Ekstra (IsExtra=1) ve Şurup (IsSyrup=1)
// ürünler varsayılan olarak listelenmez — hammaddeler Stok modülünden eklenen
// envanter malzemeleridir, ekstralar/şuruplar ise /api/extras ve /api/syrups'tan
// yönetilen eklentilerdir; hiçbiri menüde/POS ürün listesinde ayrı bir "ürün"
// gibi görünmemeli. Opsiyonel ?raw parametresi (reçete/BOM ekranı için):
//   raw=1   -> yalnızca hammaddeler
//   raw=all -> hepsi (menü + hammadde + ekstra + şurup)
async function getAllProducts(req, res) {
    try {
        const { raw } = req.query;
        let where = 'WHERE IsRawMaterial = 0 AND IsExtra = 0 AND IsSyrup = 0';
        if (raw === '1' || raw === 'true') where = 'WHERE IsRawMaterial = 1';
        else if (raw === 'all') where = '';

        const pool = await connectDB();
        const result = await pool.request().query(`SELECT * FROM Products ${where}`);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Ürünler getirilirken hata:', err);
        res.status(500).json({ error: 'Ürünler getirilemedi' });
    }
}

async function getProductById(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM Products WHERE ProductId = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürün getirilirken hata:', err);
        res.status(500).json({ error: 'Ürün getirilemedi' });
    }
}

async function createProduct(req, res) {
    try {
        const { Name, Description, Price, CategoryId, Cost, IsPopular, Barcode, StockCount, LoyaltyPointCost } = req.body;

        if (!Name || Price === undefined || Price === null || !CategoryId) {
            return res.status(400).json({ error: 'Ürün adı, fiyat ve kategori zorunludur' });
        }

        if (typeof Price !== 'number' || Price <= 0) {
            return res.status(400).json({ error: 'Fiyat pozitif bir sayı olmalıdır' });
        }

        if (Cost !== undefined && Cost !== null && (typeof Cost !== 'number' || Cost < 0)) {
            return res.status(400).json({ error: 'Maliyet negatif olmayan bir sayı olmalıdır' });
        }

        if (StockCount !== undefined && StockCount !== null && (typeof StockCount !== 'number' || StockCount < 0)) {
            return res.status(400).json({ error: 'Stok adedi negatif olmayan bir sayı olmalıdır' });
        }

        if (LoyaltyPointCost !== undefined && LoyaltyPointCost !== null && (!Number.isInteger(LoyaltyPointCost) || LoyaltyPointCost < 0)) {
            return res.status(400).json({ error: 'LoyaltyPointCost negatif olmayan bir tam sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Name', sql.NVarChar, Name)
            .input('Description', sql.NVarChar, Description)
            .input('Price', sql.Decimal(10, 2), Price)
            .input('CategoryId', sql.Int, CategoryId)
            .input('Cost', sql.Decimal(10, 2), Cost ?? null)
            .input('IsPopular', sql.Bit, IsPopular ? 1 : 0)
            .input('Barcode', sql.NVarChar(64), Barcode || null)
            .input('StockCount', sql.Int, StockCount ?? null)
            .input('LoyaltyPointCost', sql.Int, LoyaltyPointCost ?? null)
            .query(`INSERT INTO Products (Name, Description, Price, CategoryId, Cost, IsPopular, Barcode, StockCount, LoyaltyPointCost)
                    OUTPUT INSERTED.*
                    VALUES (@Name, @Description, @Price, @CategoryId, @Cost, @IsPopular, @Barcode, @StockCount, @LoyaltyPointCost)`);

        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürün oluşturulurken hata', err);
        res.status(500).json({ error: 'Ürün oluşturulamadı' });
    }
}

async function updateProduct(req, res) {
    try {
        const { id } = req.params;
        const { Name, Description, Price, CategoryId, Cost, IsPopular, Barcode, StockCount, LoyaltyPointCost } = req.body;

        if (!Name || Price === undefined || Price === null || !CategoryId) {
            return res.status(400).json({ error: 'Ürün adı, fiyat ve kategori zorunludur' });
        }

        if (typeof Price !== 'number' || Price <= 0) {
            return res.status(400).json({ error: 'Fiyat pozitif bir sayı olmalıdır' });
        }

        if (Cost !== undefined && Cost !== null && (typeof Cost !== 'number' || Cost < 0)) {
            return res.status(400).json({ error: 'Maliyet negatif olmayan bir sayı olmalıdır' });
        }

        if (StockCount !== undefined && StockCount !== null && (typeof StockCount !== 'number' || StockCount < 0)) {
            return res.status(400).json({ error: 'Stok adedi negatif olmayan bir sayı olmalıdır' });
        }

        if (LoyaltyPointCost !== undefined && LoyaltyPointCost !== null && (!Number.isInteger(LoyaltyPointCost) || LoyaltyPointCost < 0)) {
            return res.status(400).json({ error: 'LoyaltyPointCost negatif olmayan bir tam sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Name', sql.NVarChar, Name)
            .input('Description', sql.NVarChar, Description)
            .input('Price', sql.Decimal(10, 2), Price)
            .input('CategoryId', sql.Int, CategoryId)
            .input('Cost', sql.Decimal(10, 2), Cost ?? null)
            .input('IsPopular', sql.Bit, IsPopular ? 1 : 0)
            .input('Barcode', sql.NVarChar(64), Barcode || null)
            .input('StockCount', sql.Int, StockCount ?? null)
            .input('LoyaltyPointCost', sql.Int, LoyaltyPointCost ?? null)
            .query(`UPDATE Products SET Name = @Name, Description = @Description, Price = @Price, CategoryId = @CategoryId,
                    Cost = @Cost, IsPopular = @IsPopular, Barcode = @Barcode, StockCount = @StockCount, LoyaltyPointCost = @LoyaltyPointCost
                    OUTPUT INSERTED.* WHERE ProductId = @Id`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürün güncellenirken hata:', err);
        res.status(500).json({ error: 'Ürün güncellenemedi' });
    }
}

async function deleteProduct(req, res) {
    try {
        const { id } = req.params;

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query('UPDATE Products SET IsActive = 0 OUTPUT INSERTED.* WHERE ProductId = @Id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürün silinirken hata', err);
        res.status(500).json({ error: 'Ürün silinemedi' });
    }
}

// ============================================================
// ÜRÜNÜ TEKRAR AKTİF ET (SADECE ADMIN)
// ============================================================
async function reactivateProduct(req, res) {
    const { id } = req.params;
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('ProductId', sql.Int, id)
            .query(`UPDATE Products SET IsActive = 1 OUTPUT INSERTED.* WHERE ProductId = @ProductId`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        return res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürün aktif edilirken hata:', err);
        return res.status(500).json({ error: 'Ürün aktif edilemedi' });
    }
}

// ============================================================
// ÜRÜN RESMİ YÜKLE (SADECE ADMIN)
// ============================================================
async function uploadProductImage(req, res) {
    const { id } = req.params;

    if (!req.file) {
        return res.status(400).json({ error: 'Resim dosyası gerekli' });
    }

    try {
        const pool = await connectDB();
        const imageUrl = `/uploads/products/${req.file.filename}`;

        await pool.request()
            .input('Id', sql.Int, id)
            .input('ImageUrl', sql.NVarChar(255), imageUrl)
            .query('UPDATE Products SET ImageUrl = @ImageUrl WHERE ProductId = @Id');

        const updated = await pool.request()
            .input('Id', sql.Int, id)
            .query('SELECT * FROM Products WHERE ProductId = @Id');

        if (updated.recordset.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        return res.status(200).json(updated.recordset[0]);
    } catch (err) {
        console.error('Ürün resmi yüklenirken hata:', err);
        return res.status(500).json({ error: 'Resim yüklenemedi' });
    }
}

// ============================================================
// "86 / TÜKENDI" — ürünü silmeden geçici satışa aç/kapat (SADECE ADMIN)
// Body: { IsAvailable: boolean }
// ============================================================
async function setProductAvailability(req, res) {
    const { id } = req.params;
    const { IsAvailable } = req.body;

    if (typeof IsAvailable !== 'boolean') {
        return res.status(400).json({ error: 'IsAvailable true/false olmalıdır' });
    }

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('ProductId', sql.Int, id)
            .input('IsAvailable', sql.Bit, IsAvailable ? 1 : 0)
            .query(`UPDATE Products SET IsAvailable = @IsAvailable OUTPUT INSERTED.* WHERE ProductId = @ProductId`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ürün bulunamadı' });
        }
        logAudit(pool, { userId: req.user?.userId, action: 'PRODUCT_86', entityType: 'Product', entityId: Number(id), details: { IsAvailable } });
        return res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürün satış durumu güncellenirken hata:', err);
        return res.status(500).json({ error: 'Ürün satış durumu güncellenemedi' });
    }
}

// ============================================================
// ÜRÜNE BAĞLI EKSTRA/ŞURUP OPSİYONLARINI GETİR (SADECE ADMIN)
// Ürün düzenleme ekranındaki "İzin Verilen Ekstralar/Şuruplar" checkbox
// listesi için: tüm ekstra/şurup kataloğu, bu ürüne bağlı olanlar
// Attached=true + kendi IsEnabled/DisplayOrder değerleriyle işaretlenmiş
// halde döner (bkz. migrations/2026_07_29_product_options.sql).
// ============================================================
async function getProductOptions(req, res) {
    const { id } = req.params;
    try {
        const pool = await connectDB();

        const extrasResult = await pool.request()
            .input('ProductId', sql.Int, id)
            .query(`
                SELECT p.ProductId, p.Name, p.Price, p.IsActive,
                       CASE WHEN pe.ExtraProductId IS NULL THEN 0 ELSE 1 END AS Attached,
                       ISNULL(pe.IsEnabled, 0) AS IsEnabled,
                       ISNULL(pe.DisplayOrder, 0) AS DisplayOrder
                FROM Products p
                LEFT JOIN ProductExtras pe ON pe.ExtraProductId = p.ProductId AND pe.ProductId = @ProductId
                WHERE p.IsExtra = 1
                ORDER BY CASE WHEN pe.ExtraProductId IS NULL THEN 1 ELSE 0 END, pe.DisplayOrder ASC, p.Name ASC
            `);

        const syrupsResult = await pool.request()
            .input('ProductId', sql.Int, id)
            .query(`
                SELECT p.ProductId, p.Name, p.Price, p.IsActive,
                       CASE WHEN ps.SyrupProductId IS NULL THEN 0 ELSE 1 END AS Attached,
                       ISNULL(ps.IsEnabled, 0) AS IsEnabled,
                       ISNULL(ps.DisplayOrder, 0) AS DisplayOrder
                FROM Products p
                LEFT JOIN ProductSyrups ps ON ps.SyrupProductId = p.ProductId AND ps.ProductId = @ProductId
                WHERE p.IsSyrup = 1
                ORDER BY CASE WHEN ps.SyrupProductId IS NULL THEN 1 ELSE 0 END, ps.DisplayOrder ASC, p.Name ASC
            `);

        res.status(200).json({ extras: extrasResult.recordset, syrups: syrupsResult.recordset });
    } catch (err) {
        console.error('Ürün opsiyonları getirilirken hata:', err);
        res.status(500).json({ error: 'Ürün opsiyonları getirilemedi' });
    }
}

// ============================================================
// ÜRÜNE BAĞLI EKSTRA/ŞURUP OPSİYONLARINI KAYDET (SADECE ADMIN)
// Body: { Extras: [{ExtraProductId, DisplayOrder, IsEnabled}], Syrups: [...] }
// Tek seferde tam değiştirme (attach/detach/reorder/enable-disable hepsi
// bu tek istekle yapılır) — gönderilmeyen mevcut bağlantılar kaldırılır.
// ============================================================
async function saveProductOptions(req, res) {
    const { id } = req.params;
    const { Extras, Syrups } = req.body;

    if (Extras !== undefined && !Array.isArray(Extras)) {
        return res.status(400).json({ error: 'Extras bir dizi olmalıdır' });
    }
    if (Syrups !== undefined && !Array.isArray(Syrups)) {
        return res.status(400).json({ error: 'Syrups bir dizi olmalıdır' });
    }

    const extrasList = Extras || [];
    const syrupsList = Syrups || [];

    for (const e of extrasList) {
        if (typeof e.ExtraProductId !== 'number' || typeof e.DisplayOrder !== 'number' || typeof e.IsEnabled !== 'boolean') {
            return res.status(400).json({ error: 'Her ekstra için ExtraProductId, DisplayOrder ve IsEnabled gereklidir' });
        }
    }
    for (const s of syrupsList) {
        if (typeof s.SyrupProductId !== 'number' || typeof s.DisplayOrder !== 'number' || typeof s.IsEnabled !== 'boolean') {
            return res.status(400).json({ error: 'Her şurup için SyrupProductId, DisplayOrder ve IsEnabled gereklidir' });
        }
    }

    let pool;
    try {
        pool = await connectDB();
    } catch (err) {
        console.error('Veritabanına bağlanılamadı', err);
        return res.status(500).json({ error: 'Veritabanı bağlantı hatası' });
    }

    const productResult = await pool.request().input('Id', sql.Int, id).query('SELECT ProductId FROM Products WHERE ProductId = @Id');
    if (productResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Ürün bulunamadı' });
    }

    if (extrasList.length > 0) {
        const ids = [...new Set(extrasList.map((e) => e.ExtraProductId))];
        const request = pool.request();
        const placeholders = ids.map((idVal, i) => {
            const paramName = `id${i}`;
            request.input(paramName, sql.Int, idVal);
            return `@${paramName}`;
        });
        const validResult = await request.query(`SELECT ProductId FROM Products WHERE IsExtra = 1 AND ProductId IN (${placeholders.join(',')})`);
        if (validResult.recordset.length !== ids.length) {
            return res.status(400).json({ error: 'Geçersiz bir ExtraProductId gönderildi' });
        }
    }
    if (syrupsList.length > 0) {
        const ids = [...new Set(syrupsList.map((s) => s.SyrupProductId))];
        const request = pool.request();
        const placeholders = ids.map((idVal, i) => {
            const paramName = `id${i}`;
            request.input(paramName, sql.Int, idVal);
            return `@${paramName}`;
        });
        const validResult = await request.query(`SELECT ProductId FROM Products WHERE IsSyrup = 1 AND ProductId IN (${placeholders.join(',')})`);
        if (validResult.recordset.length !== ids.length) {
            return res.status(400).json({ error: 'Geçersiz bir SyrupProductId gönderildi' });
        }
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        await new sql.Request(transaction).input('ProductId', sql.Int, id).query('DELETE FROM ProductExtras WHERE ProductId = @ProductId');
        for (const e of extrasList) {
            await new sql.Request(transaction)
                .input('ProductId', sql.Int, id)
                .input('ExtraProductId', sql.Int, e.ExtraProductId)
                .input('DisplayOrder', sql.Int, e.DisplayOrder)
                .input('IsEnabled', sql.Bit, e.IsEnabled ? 1 : 0)
                .query('INSERT INTO ProductExtras (ProductId, ExtraProductId, DisplayOrder, IsEnabled) VALUES (@ProductId, @ExtraProductId, @DisplayOrder, @IsEnabled)');
        }

        await new sql.Request(transaction).input('ProductId', sql.Int, id).query('DELETE FROM ProductSyrups WHERE ProductId = @ProductId');
        for (const s of syrupsList) {
            await new sql.Request(transaction)
                .input('ProductId', sql.Int, id)
                .input('SyrupProductId', sql.Int, s.SyrupProductId)
                .input('DisplayOrder', sql.Int, s.DisplayOrder)
                .input('IsEnabled', sql.Bit, s.IsEnabled ? 1 : 0)
                .query('INSERT INTO ProductSyrups (ProductId, SyrupProductId, DisplayOrder, IsEnabled) VALUES (@ProductId, @SyrupProductId, @DisplayOrder, @IsEnabled)');
        }

        await transaction.commit();
        res.status(200).json({ Extras: extrasList, Syrups: syrupsList });
    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata (muhtemelen zaten abort olmuş):', rollbackErr.message);
        }
        console.error('Ürün opsiyonları kaydedilirken hata:', err);
        res.status(500).json({ error: 'Ürün opsiyonları kaydedilemedi' });
    }
}

// ============================================================
// SİPARİŞ EKRANI İÇİN ÜRÜNE BAĞLI OPSİYONLAR (GİRİŞ YAPMIŞ HERKES)
// Sadece bu ürüne bağlı, IsEnabled=1 VE kendisi IsActive=1 olan ekstra/
// şuruplar döner — sipariş ekranı yönetici tarafından o ürüne bağlanmamış
// bir eklentiyi asla göstermemeli.
// ============================================================
async function getProductOrderOptions(req, res) {
    const { id } = req.params;
    try {
        const pool = await connectDB();

        const extrasResult = await pool.request()
            .input('ProductId', sql.Int, id)
            .query(`
                SELECT p.ProductId, p.Name, p.Price
                FROM ProductExtras pe
                JOIN Products p ON p.ProductId = pe.ExtraProductId
                WHERE pe.ProductId = @ProductId AND pe.IsEnabled = 1 AND p.IsActive = 1
                ORDER BY pe.DisplayOrder ASC, p.Name ASC
            `);

        const syrupsResult = await pool.request()
            .input('ProductId', sql.Int, id)
            .query(`
                SELECT p.ProductId, p.Name, p.Price
                FROM ProductSyrups ps
                JOIN Products p ON p.ProductId = ps.SyrupProductId
                WHERE ps.ProductId = @ProductId AND ps.IsEnabled = 1 AND p.IsActive = 1
                ORDER BY ps.DisplayOrder ASC, p.Name ASC
            `);

        res.status(200).json({ extras: extrasResult.recordset, syrups: syrupsResult.recordset });
    } catch (err) {
        console.error('Sipariş opsiyonları getirilirken hata:', err);
        res.status(500).json({ error: 'Sipariş opsiyonları getirilemedi' });
    }
}

module.exports = {
    getAllProducts, getProductById, createProduct, updateProduct, deleteProduct,
    reactivateProduct, uploadProductImage, setProductAvailability,
    getProductOptions, saveProductOptions, getProductOrderOptions,
};