const { sql, connectDB } = require('../config/db');
const fs = require('fs');
const path = require('path');

// ============================================================
// MENÜ VERİSİ DIŞA/İÇE AKTARMA (SADECE ADMIN)
//
// ÖNEMLİ MİMARİ KARAR: İki farklı veritabanı kurulumunda ID'ler ASLA
// eşleşmez (her biri kendi otomatik-artan ID'sini üretir). Bu yüzden
// içe aktarma ID'lere göre DEĞİL, İSME göre eşleştirme yapar (Category
// Name, Product Name — case-insensitive): var olan bir kayıt isimle
// bulunursa GÜNCELLENİR, bulunamazsa YENİ oluşturulur (upsert). Bu,
// aynı JSON'u birden fazla kez içe aktarmayı güvenli/idempotent yapar.
//
// Stock.Quantity (canlı stok adedi) KESİNLİKLE dahil edilmez — bu
// operasyonel veridir, menü YAPILANDIRMASI değil. Ürün görselleri ise
// base64 olarak (ImageData/ImageFileName) JSON'a gömülür, böylece
// içe aktarıldığı kurulumda da görsel dosyası diskte oluşturulur.
// ============================================================

const CI_COLLATE = 'COLLATE Latin1_General_CI_AS';
const { PRODUCT_IMAGE_DIR: uploadDir } = require('../utils/paths');

// ============================================================
// GET /api/products/export (SADECE ADMIN)
// ============================================================
async function exportMenuData(req, res) {
    try {
        const pool = await connectDB();

        const categoriesResult = await pool.request().query(`SELECT Name, IsActive FROM Categories ORDER BY Name ASC`);

        const productsResult = await pool.request().query(`
            SELECT p.Name, p.Description, p.Price, c.Name AS CategoryName,
                   p.IsExtra, p.IsSyrup, p.IsPopular, p.Barcode, p.LoyaltyPointCost,
                   p.IsActive, p.IsAvailable, p.IsRawMaterial, p.Cost, p.StockCount, p.ImageUrl
            FROM Products p
            LEFT JOIN Categories c ON c.CategoryId = p.CategoryId
            ORDER BY p.Name ASC
        `);

        const variantsResult = await pool.request().query(`
            SELECT p.Name AS ProductName, v.VariantName AS Name, v.Price
            FROM ProductVariants v
            JOIN Products p ON p.ProductId = v.ProductId
            ORDER BY p.Name ASC, v.VariantName ASC
        `);

        const productExtrasResult = await pool.request().query(`
            SELECT p.Name AS ProductName, e.Name AS ExtraProductName, pe.DisplayOrder, pe.IsEnabled
            FROM ProductExtras pe
            JOIN Products p ON p.ProductId = pe.ProductId
            JOIN Products e ON e.ProductId = pe.ExtraProductId
            ORDER BY p.Name ASC, pe.DisplayOrder ASC
        `);

        const productSyrupsResult = await pool.request().query(`
            SELECT p.Name AS ProductName, s.Name AS SyrupProductName, ps.DisplayOrder, ps.IsEnabled
            FROM ProductSyrups ps
            JOIN Products p ON p.ProductId = ps.ProductId
            JOIN Products s ON s.ProductId = ps.SyrupProductId
            ORDER BY p.Name ASC, ps.DisplayOrder ASC
        `);

        const recipesResult = await pool.request().query(`
            SELECT mp.Name AS ProductName, rp.Name AS RawMaterialProductName, r.Quantity, r.Unit
            FROM Recipes r
            JOIN Products mp ON mp.ProductId = r.ProductId
            JOIN Products rp ON rp.ProductId = r.RawMaterialProductId
            ORDER BY mp.Name ASC
        `);

        res.status(200).json({
            exportedAt: new Date().toISOString(),
            note: 'Canlı stok adetleri (Stock.Quantity) bu dosyaya dahil değildir — bu operasyonel veridir, menü yapılandırması değildir. Ürün görselleri base64 olarak (ImageData/ImageFileName) gömülüdür.',
            categories: categoriesResult.recordset.map((c) => ({ Name: c.Name, IsActive: Boolean(c.IsActive) })),
            products: productsResult.recordset.map((p) => {
                const { ImageUrl, ...rest } = p;
                let ImageData = null;
                let ImageFileName = null;
                if (ImageUrl) {
                    const filePath = path.join(uploadDir, path.basename(ImageUrl));
                    try {
                        ImageData = fs.readFileSync(filePath).toString('base64');
                        ImageFileName = path.basename(ImageUrl);
                    } catch {
                        // Görsel dosyası diskte yoksa (ör. silinmiş) sessizce atlanır.
                    }
                }
                return {
                    ...rest,
                    IsExtra: Boolean(p.IsExtra),
                    IsSyrup: Boolean(p.IsSyrup),
                    IsPopular: Boolean(p.IsPopular),
                    IsActive: Boolean(p.IsActive),
                    IsAvailable: Boolean(p.IsAvailable),
                    IsRawMaterial: Boolean(p.IsRawMaterial),
                    ImageFileName,
                    ImageData,
                };
            }),
            variants: variantsResult.recordset,
            productExtras: productExtrasResult.recordset.map((r) => ({ ...r, IsEnabled: Boolean(r.IsEnabled) })),
            productSyrups: productSyrupsResult.recordset.map((r) => ({ ...r, IsEnabled: Boolean(r.IsEnabled) })),
            recipes: recipesResult.recordset,
        });
    } catch (err) {
        console.error('Menü verisi dışa aktarılırken hata:', err);
        res.status(500).json({ error: 'Menü verisi dışa aktarılamadı' });
    }
}

// ---------- İçe aktarma yardımcıları (hepsi AÇIK transaction içinde) ----------

async function upsertCategory(transaction, name, isActive) {
    const existing = await new sql.Request(transaction)
        .input('Name', sql.NVarChar(150), name)
        .query(`SELECT CategoryId FROM Categories WHERE Name = @Name ${CI_COLLATE}`);

    if (existing.recordset.length > 0) {
        const categoryId = existing.recordset[0].CategoryId;
        await new sql.Request(transaction)
            .input('Id', sql.Int, categoryId)
            .input('IsActive', sql.Bit, isActive ? 1 : 0)
            .query(`UPDATE Categories SET IsActive = @IsActive WHERE CategoryId = @Id`);
        return { categoryId, created: false };
    }

    const inserted = await new sql.Request(transaction)
        .input('Name', sql.NVarChar(150), name)
        .input('IsActive', sql.Bit, isActive ? 1 : 0)
        .query(`INSERT INTO Categories (Name, IsActive) OUTPUT INSERTED.CategoryId VALUES (@Name, @IsActive)`);
    return { categoryId: inserted.recordset[0].CategoryId, created: true };
}

async function upsertProduct(transaction, prod, categoryId) {
    const existing = await new sql.Request(transaction)
        .input('Name', sql.NVarChar(200), prod.Name)
        .query(`SELECT ProductId FROM Products WHERE Name = @Name ${CI_COLLATE}`);

    const fields = {
        Name: prod.Name,
        Description: prod.Description ?? null,
        Price: typeof prod.Price === 'number' ? prod.Price : 0,
        CategoryId: categoryId,
        IsExtra: prod.IsExtra ? 1 : 0,
        IsSyrup: prod.IsSyrup ? 1 : 0,
        IsPopular: prod.IsPopular ? 1 : 0,
        Barcode: prod.Barcode ?? null,
        LoyaltyPointCost: Number.isInteger(prod.LoyaltyPointCost) ? prod.LoyaltyPointCost : null,
        IsActive: prod.IsActive === undefined ? 1 : (prod.IsActive ? 1 : 0),
        IsAvailable: prod.IsAvailable === undefined ? 1 : (prod.IsAvailable ? 1 : 0),
        IsRawMaterial: prod.IsRawMaterial ? 1 : 0,
        Cost: typeof prod.Cost === 'number' ? prod.Cost : null,
        StockCount: typeof prod.StockCount === 'number' ? prod.StockCount : null,
    };

    if (existing.recordset.length > 0) {
        const productId = existing.recordset[0].ProductId;
        await new sql.Request(transaction)
            .input('Id', sql.Int, productId)
            .input('Name', sql.NVarChar(200), fields.Name)
            .input('Description', sql.NVarChar(500), fields.Description)
            .input('Price', sql.Decimal(10, 2), fields.Price)
            .input('CategoryId', sql.Int, fields.CategoryId)
            .input('IsExtra', sql.Bit, fields.IsExtra)
            .input('IsSyrup', sql.Bit, fields.IsSyrup)
            .input('IsPopular', sql.Bit, fields.IsPopular)
            .input('Barcode', sql.NVarChar(64), fields.Barcode)
            .input('LoyaltyPointCost', sql.Int, fields.LoyaltyPointCost)
            .input('IsActive', sql.Bit, fields.IsActive)
            .input('IsAvailable', sql.Bit, fields.IsAvailable)
            .input('IsRawMaterial', sql.Bit, fields.IsRawMaterial)
            .input('Cost', sql.Decimal(10, 2), fields.Cost)
            .input('StockCount', sql.Int, fields.StockCount)
            .query(`
                UPDATE Products
                SET Description = @Description, Price = @Price, CategoryId = @CategoryId,
                    IsExtra = @IsExtra, IsSyrup = @IsSyrup, IsPopular = @IsPopular, Barcode = @Barcode,
                    LoyaltyPointCost = @LoyaltyPointCost, IsActive = @IsActive, IsAvailable = @IsAvailable,
                    IsRawMaterial = @IsRawMaterial, Cost = @Cost, StockCount = @StockCount
                WHERE ProductId = @Id
            `);
        return { productId, created: false };
    }

    const inserted = await new sql.Request(transaction)
        .input('Name', sql.NVarChar(200), fields.Name)
        .input('Description', sql.NVarChar(500), fields.Description)
        .input('Price', sql.Decimal(10, 2), fields.Price)
        .input('CategoryId', sql.Int, fields.CategoryId)
        .input('IsExtra', sql.Bit, fields.IsExtra)
        .input('IsSyrup', sql.Bit, fields.IsSyrup)
        .input('IsPopular', sql.Bit, fields.IsPopular)
        .input('Barcode', sql.NVarChar(64), fields.Barcode)
        .input('LoyaltyPointCost', sql.Int, fields.LoyaltyPointCost)
        .input('IsActive', sql.Bit, fields.IsActive)
        .input('IsAvailable', sql.Bit, fields.IsAvailable)
        .input('IsRawMaterial', sql.Bit, fields.IsRawMaterial)
        .input('Cost', sql.Decimal(10, 2), fields.Cost)
        .input('StockCount', sql.Int, fields.StockCount)
        .query(`
            INSERT INTO Products (Name, Description, Price, CategoryId, IsExtra, IsSyrup, IsPopular,
                                   Barcode, LoyaltyPointCost, IsActive, IsAvailable, IsRawMaterial, Cost, StockCount)
            OUTPUT INSERTED.ProductId
            VALUES (@Name, @Description, @Price, @CategoryId, @IsExtra, @IsSyrup, @IsPopular,
                    @Barcode, @LoyaltyPointCost, @IsActive, @IsAvailable, @IsRawMaterial, @Cost, @StockCount)
        `);
    return { productId: inserted.recordset[0].ProductId, created: true };
}

// Base64 görsel verisini diske yazar ve Products.ImageUrl'i günceller.
// Bozuk/geçersiz base64 veya yazma hatası içe aktarmayı DURDURMAZ, sessizce atlanır
// (çağıran taraf warnings dizisine ekler).
async function saveProductImage(transaction, productId, imageData, imageFileName) {
    const ext = path.extname(imageFileName || '') || '.png';
    const fileName = `product-${productId}-${Date.now()}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));

    const imageUrl = `/uploads/products/${fileName}`;
    await new sql.Request(transaction)
        .input('Id', sql.Int, productId)
        .input('ImageUrl', sql.NVarChar(255), imageUrl)
        .query(`UPDATE Products SET ImageUrl = @ImageUrl WHERE ProductId = @Id`);
}

async function upsertVariant(transaction, productId, name, price) {
    if (name) {
        const existing = await new sql.Request(transaction)
            .input('ProductId', sql.Int, productId)
            .input('Name', sql.NVarChar(100), name)
            .query(`SELECT ProductVariantsId FROM ProductVariants WHERE ProductId = @ProductId AND VariantName = @Name ${CI_COLLATE}`);

        if (existing.recordset.length > 0) {
            await new sql.Request(transaction)
                .input('Id', sql.Int, existing.recordset[0].ProductVariantsId)
                .input('Price', sql.Decimal(10, 2), price || 0)
                .query(`UPDATE ProductVariants SET Price = @Price WHERE ProductVariantsId = @Id`);
            return;
        }
    }

    await new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .input('Name', sql.NVarChar(100), name || null)
        .input('Price', sql.Decimal(10, 2), price || 0)
        .query(`INSERT INTO ProductVariants (ProductId, VariantName, Price) VALUES (@ProductId, @Name, @Price)`);
}

async function upsertProductExtra(transaction, productId, extraProductId, displayOrder, isEnabled) {
    const existing = await new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .input('ExtraProductId', sql.Int, extraProductId)
        .query(`SELECT 1 FROM ProductExtras WHERE ProductId = @ProductId AND ExtraProductId = @ExtraProductId`);

    const request = new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .input('ExtraProductId', sql.Int, extraProductId)
        .input('DisplayOrder', sql.Int, displayOrder || 0)
        .input('IsEnabled', sql.Bit, isEnabled === undefined ? 1 : (isEnabled ? 1 : 0));

    if (existing.recordset.length > 0) {
        await request.query(`UPDATE ProductExtras SET DisplayOrder = @DisplayOrder, IsEnabled = @IsEnabled WHERE ProductId = @ProductId AND ExtraProductId = @ExtraProductId`);
    } else {
        await request.query(`INSERT INTO ProductExtras (ProductId, ExtraProductId, DisplayOrder, IsEnabled) VALUES (@ProductId, @ExtraProductId, @DisplayOrder, @IsEnabled)`);
    }
}

async function upsertProductSyrup(transaction, productId, syrupProductId, displayOrder, isEnabled) {
    const existing = await new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .input('SyrupProductId', sql.Int, syrupProductId)
        .query(`SELECT 1 FROM ProductSyrups WHERE ProductId = @ProductId AND SyrupProductId = @SyrupProductId`);

    const request = new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .input('SyrupProductId', sql.Int, syrupProductId)
        .input('DisplayOrder', sql.Int, displayOrder || 0)
        .input('IsEnabled', sql.Bit, isEnabled === undefined ? 1 : (isEnabled ? 1 : 0));

    if (existing.recordset.length > 0) {
        await request.query(`UPDATE ProductSyrups SET DisplayOrder = @DisplayOrder, IsEnabled = @IsEnabled WHERE ProductId = @ProductId AND SyrupProductId = @SyrupProductId`);
    } else {
        await request.query(`INSERT INTO ProductSyrups (ProductId, SyrupProductId, DisplayOrder, IsEnabled) VALUES (@ProductId, @SyrupProductId, @DisplayOrder, @IsEnabled)`);
    }
}

async function upsertRecipe(transaction, productId, rawMaterialProductId, quantity, unit) {
    const existing = await new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .input('RawMaterialProductId', sql.Int, rawMaterialProductId)
        .query(`SELECT RecipeId FROM Recipes WHERE ProductId = @ProductId AND RawMaterialProductId = @RawMaterialProductId`);

    if (existing.recordset.length > 0) {
        await new sql.Request(transaction)
            .input('Id', sql.Int, existing.recordset[0].RecipeId)
            .input('Quantity', sql.Decimal(10, 3), quantity)
            .input('Unit', sql.NVarChar(20), unit ?? null)
            .query(`UPDATE Recipes SET Quantity = @Quantity, Unit = @Unit WHERE RecipeId = @Id`);
        return;
    }

    await new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .input('RawMaterialProductId', sql.Int, rawMaterialProductId)
        .input('Quantity', sql.Decimal(10, 3), quantity)
        .input('Unit', sql.NVarChar(20), unit ?? null)
        .query(`INSERT INTO Recipes (ProductId, RawMaterialProductId, Quantity, Unit) VALUES (@ProductId, @RawMaterialProductId, @Quantity, @Unit)`);
}

// ============================================================
// POST /api/products/import (SADECE ADMIN)
// TEK bir transaction: categories -> products -> variants/productExtras/
// productSyrups/recipes (hepsi ProductName üzerinden ilgili ProductId'yi
// bulur). Bulunamayan bir referans işlemi DURDURMAZ, warnings'e eklenir.
// ============================================================
async function importMenuData(req, res) {
    const body = req.body || {};
    const categories = Array.isArray(body.categories) ? body.categories : [];
    const products = Array.isArray(body.products) ? body.products : [];
    const variants = Array.isArray(body.variants) ? body.variants : [];
    const productExtras = Array.isArray(body.productExtras) ? body.productExtras : [];
    const productSyrups = Array.isArray(body.productSyrups) ? body.productSyrups : [];
    const recipes = Array.isArray(body.recipes) ? body.recipes : [];

    let pool;
    try {
        pool = await connectDB();
    } catch (err) {
        console.error('Veritabanına bağlanılamadı', err);
        return res.status(500).json({ error: 'Veritabanı bağlantı hatası' });
    }

    const transaction = new sql.Transaction(pool);
    const warnings = [];
    let categoriesCreated = 0;
    let categoriesUpdated = 0;
    let productsCreated = 0;
    let productsUpdated = 0;

    try {
        await transaction.begin();

        // ---------- 1) Kategoriler (Name'e göre upsert) ----------
        const categoryIdByName = new Map(); // lowercased Name -> CategoryId
        for (const cat of categories) {
            if (!cat || typeof cat.Name !== 'string' || !cat.Name.trim()) {
                warnings.push('Adı boş olan bir kategori atlandı.');
                continue;
            }
            const name = cat.Name.trim();
            const { categoryId, created } = await upsertCategory(transaction, name, cat.IsActive !== false);
            categoryIdByName.set(name.toLowerCase(), categoryId);
            if (created) categoriesCreated++; else categoriesUpdated++;
        }

        // ---------- 2) Ürünler (Name'e göre upsert, CategoryName -> CategoryId) ----------
        const productIdByName = new Map(); // lowercased Name -> ProductId
        for (const prod of products) {
            if (!prod || typeof prod.Name !== 'string' || !prod.Name.trim()) {
                warnings.push('Adı boş olan bir ürün atlandı.');
                continue;
            }
            const name = prod.Name.trim();

            let categoryId = null;
            if (prod.CategoryName) {
                const key = String(prod.CategoryName).trim().toLowerCase();
                categoryId = categoryIdByName.get(key) ?? null;
                if (categoryId === null) {
                    // JSON'da categories dizisinde yoktu — mevcut veritabanında var mı diye ayrıca bak.
                    const found = await new sql.Request(transaction)
                        .input('Name', sql.NVarChar(150), prod.CategoryName)
                        .query(`SELECT CategoryId FROM Categories WHERE Name = @Name ${CI_COLLATE}`);
                    if (found.recordset.length > 0) {
                        categoryId = found.recordset[0].CategoryId;
                        categoryIdByName.set(key, categoryId);
                    } else {
                        warnings.push(`"${name}" ürünü için "${prod.CategoryName}" kategorisi bulunamadı, kategorisiz içe aktarıldı.`);
                    }
                }
            }

            const { productId, created } = await upsertProduct(transaction, { ...prod, Name: name }, categoryId);
            productIdByName.set(name.toLowerCase(), productId);
            if (created) productsCreated++; else productsUpdated++;

            if (typeof prod.ImageData === 'string' && prod.ImageData.trim()) {
                try {
                    await saveProductImage(transaction, productId, prod.ImageData, prod.ImageFileName);
                } catch (imgErr) {
                    warnings.push(`"${name}" ürününün görseli kaydedilemedi: ${imgErr.message}`);
                }
            }
        }

        // Payload'daki products dizisinde YER ALMAYAN ama variants/productExtras/
        // productSyrups/recipes içinde referans verilen bir ürün adı varsa (ör.
        // sadece kısmi bir JSON elle düzenlenmiş olabilir), var olan veritabanında
        // ara — bulunamazsa ilgili satır warning ile atlanır.
        async function resolveProductId(name) {
            if (!name) return null;
            const key = String(name).trim().toLowerCase();
            if (productIdByName.has(key)) return productIdByName.get(key);
            const found = await new sql.Request(transaction)
                .input('Name', sql.NVarChar(200), name)
                .query(`SELECT ProductId FROM Products WHERE Name = @Name ${CI_COLLATE}`);
            if (found.recordset.length > 0) {
                productIdByName.set(key, found.recordset[0].ProductId);
                return found.recordset[0].ProductId;
            }
            return null;
        }

        // ---------- 3) Varyantlar ----------
        for (const v of variants) {
            if (!v || typeof v.ProductName !== 'string') {
                warnings.push('Geçersiz bir varyant kaydı atlandı.');
                continue;
            }
            const productId = await resolveProductId(v.ProductName);
            if (!productId) {
                warnings.push(`Varyant için "${v.ProductName}" ürünü bulunamadı, atlandı.`);
                continue;
            }
            await upsertVariant(transaction, productId, v.Name, v.Price);
        }

        // ---------- 4) Ürün Ekstraları ----------
        for (const pe of productExtras) {
            if (!pe || typeof pe.ProductName !== 'string' || typeof pe.ExtraProductName !== 'string') {
                warnings.push('Geçersiz bir ürün-ekstra bağlantısı atlandı.');
                continue;
            }
            const productId = await resolveProductId(pe.ProductName);
            const extraProductId = await resolveProductId(pe.ExtraProductName);
            if (!productId || !extraProductId) {
                warnings.push(`"${pe.ProductName}" -> "${pe.ExtraProductName}" ekstra bağlantısı için ürün(ler) bulunamadı, atlandı.`);
                continue;
            }
            await upsertProductExtra(transaction, productId, extraProductId, pe.DisplayOrder, pe.IsEnabled);
        }

        // ---------- 5) Ürün Şurupları ----------
        for (const ps of productSyrups) {
            if (!ps || typeof ps.ProductName !== 'string' || typeof ps.SyrupProductName !== 'string') {
                warnings.push('Geçersiz bir ürün-şurup bağlantısı atlandı.');
                continue;
            }
            const productId = await resolveProductId(ps.ProductName);
            const syrupProductId = await resolveProductId(ps.SyrupProductName);
            if (!productId || !syrupProductId) {
                warnings.push(`"${ps.ProductName}" -> "${ps.SyrupProductName}" şurup bağlantısı için ürün(ler) bulunamadı, atlandı.`);
                continue;
            }
            await upsertProductSyrup(transaction, productId, syrupProductId, ps.DisplayOrder, ps.IsEnabled);
        }

        // ---------- 6) Reçeteler ----------
        for (const r of recipes) {
            if (!r || typeof r.ProductName !== 'string' || typeof r.RawMaterialProductName !== 'string' || typeof r.Quantity !== 'number' || r.Quantity <= 0) {
                warnings.push('Geçersiz bir reçete kaydı atlandı.');
                continue;
            }
            const productId = await resolveProductId(r.ProductName);
            const rawMaterialProductId = await resolveProductId(r.RawMaterialProductName);
            if (!productId) {
                warnings.push(`Reçete için "${r.ProductName}" ürünü bulunamadı, atlandı.`);
                continue;
            }
            if (!rawMaterialProductId) {
                warnings.push(`Reçete için "${r.RawMaterialProductName}" hammaddesi bulunamadı, atlandı.`);
                continue;
            }
            if (productId === rawMaterialProductId) {
                warnings.push(`"${r.ProductName}" kendi kendine reçete olamaz, atlandı.`);
                continue;
            }
            await upsertRecipe(transaction, productId, rawMaterialProductId, r.Quantity, r.Unit);
        }

        await transaction.commit();

        res.status(200).json({ categoriesCreated, categoriesUpdated, productsCreated, productsUpdated, warnings });
    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback sırasında ek hata (muhtemelen zaten abort olmuş):', rollbackErr.message);
        }
        console.error('Menü verisi içe aktarılırken hata:', err);
        res.status(500).json({ error: 'Menü verisi içe aktarılamadı' });
    }
}

module.exports = { exportMenuData, importMenuData };
