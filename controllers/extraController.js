const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { getUnitIds, upsertServingSize } = require('../utils/servingSize');

// ============================================================
// EKSTRALAR (ekstra shot, ekstra çikolata, şurup vb.)
// Products tablosunda IsExtra=1 olarak saklanır; menüde satılmaz,
// sipariş kalemine eklenti olarak seçilir (bkz. orderController).
// Stok takibi istenirse mevcut /api/stock akışıyla (ProductId
// vererek) bu ürüne bağlanabilir.
//
// PORSİYON TÜKETİMİ: syrupController.js ile BİREBİR AYNI desen — Birim
// Dönüşüm Sistemi (bkz. migrations/2026_08_14_unit_conversion_system.sql,
// utils/unitConversion.js). "1 porsiyon kaç stok birimi" ProductUnitConversions'a
// yazılır, Products.ServingSize gibi ürüne özel bir kolona DEĞİL.
// ============================================================

async function getAllExtras(req, res) {
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
            WHERE p.IsExtra = 1
            ORDER BY p.Name ASC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Ekstralar getirilirken hata:', err);
        res.status(500).json({ error: 'Ekstralar getirilemedi' });
    }
}

// ============================================================
// YENİ EKSTRA OLUŞTUR (SADECE ADMIN)
// ============================================================
async function createExtra(req, res) {
    try {
        const { Name, Price, ServingSize } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Ekstra adı zorunludur' });
        }
        if (typeof Price !== 'number' || Price < 0) {
            return res.status(400).json({ error: 'Fiyat negatif olmayan bir sayı olmalıdır' });
        }
        if (ServingSize !== undefined && ServingSize !== null && (typeof ServingSize !== 'number' || ServingSize <= 0)) {
            return res.status(400).json({ error: 'Porsiyon başına tüketim (varsa) 0\'dan büyük bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const trimmedName = Name.trim();

        // syrupController.createSyrup ile AYNI mantık: aynı isimde zaten bir
        // ürün (ör. Stok sayfasından hammadde olarak eklenmiş) varsa YENİ bir
        // ürün açmak yerine o var olanı ekstra olarak işaretle — stok kaydı
        // (varsa) ProductId üzerinden olduğu gibi bağlı kalır.
        const existing = await pool.request()
            .input('Name', sql.NVarChar(200), trimmedName)
            .query(`SELECT ProductId, IsExtra FROM Products WHERE Name = @Name`);

        if (existing.recordset.length > 0 && existing.recordset[0].IsExtra) {
            return res.status(409).json({ error: `"${trimmedName}" adında bir ekstra zaten var.` });
        }

        let productId;
        if (existing.recordset.length > 0) {
            productId = existing.recordset[0].ProductId;
            await pool.request()
                .input('Id', sql.Int, productId)
                .input('Price', sql.Decimal(10, 2), Price)
                .query(`UPDATE Products SET IsExtra = 1, Price = @Price WHERE ProductId = @Id`);
        } else {
            // Products.CategoryId NOT NULL — ekstralar menüde görünmeyen "Ekstra"
            // kategorisine bağlanır (Hammadde ürünlerin "Hammadde" kategorisine
            // bağlanmasıyla aynı desen, bkz. stockController.createStockItem).
            const categoryResult = await pool.request()
                .query(`SELECT TOP 1 CategoryId FROM Categories WHERE Name = 'Ekstra'`);

            if (categoryResult.recordset.length === 0) {
                return res.status(500).json({ error: '"Ekstra" kategorisi bulunamadı, migration çalıştırılmamış olabilir' });
            }

            const inserted = await pool.request()
                .input('Name', sql.NVarChar(200), trimmedName)
                .input('Price', sql.Decimal(10, 2), Price)
                .input('CategoryId', sql.Int, categoryResult.recordset[0].CategoryId)
                .query(`
                    INSERT INTO Products (Name, Price, IsExtra, IsRawMaterial, CategoryId)
                    OUTPUT INSERTED.ProductId
                    VALUES (@Name, @Price, 1, 0, @CategoryId)
                `);
            productId = inserted.recordset[0].ProductId;
        }

        if (ServingSize !== undefined) {
            await upsertServingSize(pool, productId, ServingSize ?? null, await getUnitIds(pool));
        }

        // syrupController.createSyrup ile AYNI gerekçe: ekstra da stoktan
        // tüketilir, o yüzden Stock kaydı yoksa 0 adetle otomatik açılır.
        await pool.request()
            .input('ProductId', sql.Int, productId)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM Stock WHERE ProductId = @ProductId)
                INSERT INTO Stock (ProductId, Quantity, MinStockLevel, IsTracked) VALUES (@ProductId, 0, 0, 1)
            `);

        const result = await pool.request()
            .input('Id', sql.Int, productId)
            .query(`SELECT ProductId, Name, Price, IsActive FROM Products WHERE ProductId = @Id`);

        res.status(201).json({ ...result.recordset[0], ServingSize: ServingSize ?? null });
    } catch (err) {
        console.error('Ekstra oluşturulurken hata:', err);
        res.status(500).json({ error: 'Ekstra oluşturulamadı' });
    }
}

// ============================================================
// EKSTRAYI DÜZENLE (SADECE ADMIN)
// ============================================================
async function updateExtra(req, res) {
    try {
        const { id } = req.params;
        const { Name, Price, ServingSize } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Ekstra adı zorunludur' });
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
                WHERE ProductId = @Id AND IsExtra = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ekstra bulunamadı' });
        }

        if (ServingSize !== undefined) {
            await upsertServingSize(pool, Number(id), ServingSize ?? null, await getUnitIds(pool));
        }

        // Bu düzeltmeden ÖNCE oluşturulmuş ekstralarda Stock kaydı hiç
        // açılmamış olabilir — düzenlerken geriye dönük tamamlanır.
        await pool.request()
            .input('ProductId', sql.Int, id)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM Stock WHERE ProductId = @ProductId)
                INSERT INTO Stock (ProductId, Quantity, MinStockLevel, IsTracked) VALUES (@ProductId, 0, 0, 1)
            `);

        res.status(200).json({ ...result.recordset[0], ServingSize: ServingSize ?? null });
    } catch (err) {
        console.error('Ekstra güncellenirken hata:', err);
        res.status(500).json({ error: 'Ekstra güncellenemedi' });
    }
}

// ============================================================
// EKSTRAYI PASİFLEŞTİR (SADECE ADMIN) — geçmiş siparişlerdeki
// snapshot fiyatları etkilenmesin diye silinmez, IsActive=0 yapılır.
// ============================================================
async function deleteExtra(req, res) {
    try {
        const { id } = req.params;
        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query(`
                UPDATE Products SET IsActive = 0
                OUTPUT INSERTED.ProductId, INSERTED.Name, INSERTED.Price, INSERTED.IsActive
                WHERE ProductId = @Id AND IsExtra = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Ekstra bulunamadı' });
        }

        logAudit(pool, {
            userId: req.user?.userId, action: 'EXTRA_DELETE', entityType: 'Extra', entityId: Number(id),
            details: { name: result.recordset[0].Name },
        });

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Ekstra silinirken hata:', err);
        res.status(500).json({ error: 'Ekstra silinemedi' });
    }
}

module.exports = { getAllExtras, createExtra, updateExtra, deleteExtra };
