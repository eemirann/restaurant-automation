const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

// ============================================================
// EKSTRALAR (ekstra shot, ekstra çikolata, şurup vb.)
// Products tablosunda IsExtra=1 olarak saklanır; menüde satılmaz,
// sipariş kalemine eklenti olarak seçilir (bkz. orderController).
// Stok takibi istenirse mevcut /api/stock akışıyla (ProductId
// vererek) bu ürüne bağlanabilir.
// ============================================================

async function getAllExtras(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT p.ProductId, p.Name, p.Price, p.IsActive,
                   s.Quantity AS StockQuantity, s.MinStockLevel
            FROM Products p
            LEFT JOIN Stock s ON s.ProductId = p.ProductId
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
        const { Name, Price } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Ekstra adı zorunludur' });
        }
        if (typeof Price !== 'number' || Price < 0) {
            return res.status(400).json({ error: 'Fiyat negatif olmayan bir sayı olmalıdır' });
        }

        const pool = await connectDB();

        // Products.CategoryId NOT NULL — ekstralar menüde görünmeyen "Ekstra"
        // kategorisine bağlanır (Hammadde ürünlerin "Hammadde" kategorisine
        // bağlanmasıyla aynı desen, bkz. stockController.createStockItem).
        const categoryResult = await pool.request()
            .query(`SELECT TOP 1 CategoryId FROM Categories WHERE Name = 'Ekstra'`);

        if (categoryResult.recordset.length === 0) {
            return res.status(500).json({ error: '"Ekstra" kategorisi bulunamadı, migration çalıştırılmamış olabilir' });
        }

        const result = await pool.request()
            .input('Name', sql.NVarChar(200), Name.trim())
            .input('Price', sql.Decimal(10, 2), Price)
            .input('CategoryId', sql.Int, categoryResult.recordset[0].CategoryId)
            .query(`
                INSERT INTO Products (Name, Price, IsExtra, IsRawMaterial, CategoryId)
                OUTPUT INSERTED.ProductId, INSERTED.Name, INSERTED.Price, INSERTED.IsActive
                VALUES (@Name, @Price, 1, 0, @CategoryId)
            `);

        res.status(201).json(result.recordset[0]);
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
        const { Name, Price } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Ekstra adı zorunludur' });
        }
        if (typeof Price !== 'number' || Price < 0) {
            return res.status(400).json({ error: 'Fiyat negatif olmayan bir sayı olmalıdır' });
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
        res.status(200).json(result.recordset[0]);
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
