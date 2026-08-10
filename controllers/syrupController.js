const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

// ============================================================
// ŞURUPLAR (vanilya, karamel, fındık, çikolata vb.)
// Products tablosunda IsSyrup=1 olarak saklanır; menüde satılmaz,
// sipariş kalemine eklenti olarak seçilir (bkz. orderController).
// Stok takibi istenirse mevcut /api/stock akışıyla (ProductId
// vererek) bu ürüne bağlanabilir.
//
// PORSİYON TÜKETİMİ: Birim Dönüşüm Sistemi'ni kullanır (bkz. migrations/
// 2026_08_14_unit_conversion_system.sql, utils/unitConversion.js). API
// sözleşmesi (ServingSize alanı) sadeliği korumak için AYNI kaldı — "1
// porsiyon kaç ml" — ama artık sabit bir Products.ServingSize kolonu
// yerine ProductUnitConversions'a (porsiyon -> ml) bir satır olarak
// yazılıyor. Bu sayede aynı motor Extralar/Reçeteler'de de (farklı stok
// birimleriyle: g, kg, adet...) hiç kod tekrarı olmadan kullanılabilir.
// ============================================================

// "porsiyon" ve "ml" birimlerinin ID'lerini getirir (statik seed verisi,
// process ömrü boyunca değişmez — ama burada basitlik için her istekte
// taze okunuyor, ölçek sorunuysa utils/unitConversion.js'teki önbellekli
// getPorsiyonUnitId ile aynı desene taşınabilir).
async function getUnitIds(pool) {
    const result = await pool.request().query(`SELECT UnitId, Code FROM Units WHERE Code IN (N'porsiyon', N'ml')`);
    const porsiyon = result.recordset.find((u) => u.Code === 'porsiyon')?.UnitId;
    const ml = result.recordset.find((u) => u.Code === 'ml')?.UnitId;
    if (!porsiyon || !ml) throw new Error('"porsiyon"/"ml" birimleri bulunamadı, migration çalıştırılmamış olabilir');
    return { porsiyon, ml };
}

// Products.StockUnitId = ml yapar ve ProductUnitConversions'a (porsiyon -> ml,
// Factor=servingSize) upsert eder. servingSize null/undefined ise mevcut
// dönüşüm satırı SİLİNİR (kullanıcı "porsiyon tüketimini" temizlemiş demektir).
async function upsertServingSize(pool, productId, servingSize, { porsiyon, ml }) {
    if (servingSize == null) {
        await pool.request()
            .input('ProductId', sql.Int, productId)
            .input('FromUnitId', sql.Int, porsiyon)
            .query(`DELETE FROM ProductUnitConversions WHERE ProductId = @ProductId AND FromUnitId = @FromUnitId`);
        return;
    }

    await pool.request()
        .input('ProductId', sql.Int, productId)
        .input('StockUnitId', sql.Int, ml)
        .query(`UPDATE Products SET StockUnitId = @StockUnitId WHERE ProductId = @ProductId`);

    await pool.request()
        .input('ProductId', sql.Int, productId)
        .input('FromUnitId', sql.Int, porsiyon)
        .input('ToUnitId', sql.Int, ml)
        .input('Factor', sql.Decimal(18, 6), servingSize)
        .query(`
            MERGE ProductUnitConversions AS target
            USING (SELECT @ProductId AS ProductId, @FromUnitId AS FromUnitId, @ToUnitId AS ToUnitId) AS src
            ON target.ProductId = src.ProductId AND target.FromUnitId = src.FromUnitId AND target.ToUnitId = src.ToUnitId
            WHEN MATCHED THEN UPDATE SET Factor = @Factor
            WHEN NOT MATCHED THEN INSERT (ProductId, FromUnitId, ToUnitId, Factor) VALUES (@ProductId, @FromUnitId, @ToUnitId, @Factor);
        `);
}

async function getAllSyrups(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT p.ProductId, p.Name, p.Price, p.IsActive,
                   puc.Factor AS ServingSize,
                   s.Quantity AS StockQuantity, s.MinStockLevel
            FROM Products p
            LEFT JOIN Stock s ON s.ProductId = p.ProductId
            LEFT JOIN ProductUnitConversions puc ON puc.ProductId = p.ProductId
                AND puc.FromUnitId = (SELECT UnitId FROM Units WHERE Code = N'porsiyon')
                AND puc.ToUnitId = p.StockUnitId
            WHERE p.IsSyrup = 1
            ORDER BY p.Name ASC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Şuruplar getirilirken hata:', err);
        res.status(500).json({ error: 'Şuruplar getirilemedi' });
    }
}

// ============================================================
// YENİ ŞURUP OLUŞTUR (SADECE ADMIN)
// ============================================================
async function createSyrup(req, res) {
    try {
        const { Name, Price, ServingSize } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Şurup adı zorunludur' });
        }
        if (typeof Price !== 'number' || Price < 0) {
            return res.status(400).json({ error: 'Fiyat negatif olmayan bir sayı olmalıdır' });
        }
        if (ServingSize !== undefined && ServingSize !== null && (typeof ServingSize !== 'number' || ServingSize <= 0)) {
            return res.status(400).json({ error: 'Porsiyon başına tüketim (varsa) 0\'dan büyük bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const trimmedName = Name.trim();

        // Aynı isimde zaten bir ÜRÜN var mı? (case-insensitive — DB collation'ı
        // zaten Customers.Username'de olduğu gibi CI genelde). Varsa YENİ bir
        // ürün AÇMAK yerine o var olanı şurup olarak İŞARETLERİZ — aksi halde
        // "Stok sayfasında zaten bir hammadde olarak eklenmiş Vanilya Şurup"
        // ile "Şuruplar sayfasında yeni açılan Vanilya" birbirinden habersiz
        // İKİ AYRI ürün olarak kalıyordu, stok hiç eşleşmiyordu.
        const existing = await pool.request()
            .input('Name', sql.NVarChar(200), trimmedName)
            .query(`SELECT ProductId, IsSyrup FROM Products WHERE Name = @Name`);

        if (existing.recordset.length > 0 && existing.recordset[0].IsSyrup) {
            return res.status(409).json({ error: `"${trimmedName}" adında bir şurup zaten var.` });
        }

        let productId;
        if (existing.recordset.length > 0) {
            // Var olan ürünü (ör. Stok sayfasından hammadde olarak eklenmiş)
            // şurup olarak işaretle — Stock kaydı (varsa) ProductId üzerinden
            // OLDUĞU GİBİ bağlı kalır, hiçbir şey yeniden oluşturulmaz.
            productId = existing.recordset[0].ProductId;
            await pool.request()
                .input('Id', sql.Int, productId)
                .input('Price', sql.Decimal(10, 2), Price)
                .query(`UPDATE Products SET IsSyrup = 1, Price = @Price WHERE ProductId = @Id`);
        } else {
            // Products.CategoryId NOT NULL — şuruplar menüde görünmeyen "Şurup"
            // kategorisine bağlanır (bkz. extraController.createExtra ile aynı desen).
            const categoryResult = await pool.request()
                .query(`SELECT TOP 1 CategoryId FROM Categories WHERE Name = 'Şurup'`);

            if (categoryResult.recordset.length === 0) {
                return res.status(500).json({ error: '"Şurup" kategorisi bulunamadı, migration çalıştırılmamış olabilir' });
            }

            const inserted = await pool.request()
                .input('Name', sql.NVarChar(200), trimmedName)
                .input('Price', sql.Decimal(10, 2), Price)
                .input('CategoryId', sql.Int, categoryResult.recordset[0].CategoryId)
                .query(`
                    INSERT INTO Products (Name, Price, IsSyrup, IsRawMaterial, CategoryId)
                    OUTPUT INSERTED.ProductId
                    VALUES (@Name, @Price, 1, 0, @CategoryId)
                `);
            productId = inserted.recordset[0].ProductId;
        }

        if (ServingSize !== undefined) {
            await upsertServingSize(pool, productId, ServingSize ?? null, await getUnitIds(pool));
        }

        const result = await pool.request()
            .input('Id', sql.Int, productId)
            .query(`SELECT ProductId, Name, Price, IsActive FROM Products WHERE ProductId = @Id`);

        res.status(201).json({ ...result.recordset[0], ServingSize: ServingSize ?? null });
    } catch (err) {
        console.error('Şurup oluşturulurken hata:', err);
        res.status(500).json({ error: 'Şurup oluşturulamadı' });
    }
}

// ============================================================
// ŞURUBU DÜZENLE (SADECE ADMIN)
// ============================================================
async function updateSyrup(req, res) {
    try {
        const { id } = req.params;
        const { Name, Price, ServingSize } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Şurup adı zorunludur' });
        }
        if (typeof Price !== 'number' || Price < 0) {
            return res.status(400).json({ error: 'Fiyat negatif olmayan bir sayı olmalıdır' });
        }
        if (ServingSize !== undefined && ServingSize !== null && (typeof ServingSize !== 'number' || ServingSize <= 0)) {
            return res.status(400).json({ error: 'Porsiyon başına tüketim (varsa) 0\'dan büyük bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Name', sql.NVarChar(200), Name.trim())
            .input('Price', sql.Decimal(10, 2), Price)
            .query(`
                UPDATE Products SET Name = @Name, Price = @Price
                OUTPUT INSERTED.ProductId, INSERTED.Name, INSERTED.Price, INSERTED.IsActive
                WHERE ProductId = @Id AND IsSyrup = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Şurup bulunamadı' });
        }

        if (ServingSize !== undefined) {
            await upsertServingSize(pool, Number(id), ServingSize ?? null, await getUnitIds(pool));
        }

        res.status(200).json({ ...result.recordset[0], ServingSize: ServingSize ?? null });
    } catch (err) {
        console.error('Şurup güncellenirken hata:', err);
        res.status(500).json({ error: 'Şurup güncellenemedi' });
    }
}

// ============================================================
// ŞURUBU PASİFLEŞTİR (SADECE ADMIN) — geçmiş siparişlerdeki
// snapshot fiyatları etkilenmesin diye silinmez, IsActive=0 yapılır.
// ============================================================
async function deleteSyrup(req, res) {
    try {
        const { id } = req.params;
        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query(`
                UPDATE Products SET IsActive = 0
                OUTPUT INSERTED.ProductId, INSERTED.Name, INSERTED.Price, INSERTED.IsActive
                WHERE ProductId = @Id AND IsSyrup = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Şurup bulunamadı' });
        }

        logAudit(pool, {
            userId: req.user?.userId, action: 'SYRUP_DELETE', entityType: 'Syrup', entityId: Number(id),
            details: { name: result.recordset[0].Name },
        });

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Şurup silinirken hata:', err);
        res.status(500).json({ error: 'Şurup silinemedi' });
    }
}

module.exports = { getAllSyrups, createSyrup, updateSyrup, deleteSyrup };
