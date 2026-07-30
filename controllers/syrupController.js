const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

// ============================================================
// ŞURUPLAR (vanilya, karamel, fındık, çikolata vb.)
// Products tablosunda IsSyrup=1 olarak saklanır; menüde satılmaz,
// sipariş kalemine eklenti olarak seçilir (bkz. orderController).
// Stok takibi istenirse mevcut /api/stock akışıyla (ProductId
// vererek) bu ürüne bağlanabilir.
// ============================================================

async function getAllSyrups(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT p.ProductId, p.Name, p.Price, p.IsActive,
                   s.Quantity AS StockQuantity, s.MinStockLevel
            FROM Products p
            LEFT JOIN Stock s ON s.ProductId = p.ProductId
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
        const { Name, Price } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Şurup adı zorunludur' });
        }
        if (typeof Price !== 'number' || Price < 0) {
            return res.status(400).json({ error: 'Fiyat negatif olmayan bir sayı olmalıdır' });
        }

        const pool = await connectDB();

        // Products.CategoryId NOT NULL — şuruplar menüde görünmeyen "Şurup"
        // kategorisine bağlanır (bkz. extraController.createExtra ile aynı desen).
        const categoryResult = await pool.request()
            .query(`SELECT TOP 1 CategoryId FROM Categories WHERE Name = 'Şurup'`);

        if (categoryResult.recordset.length === 0) {
            return res.status(500).json({ error: '"Şurup" kategorisi bulunamadı, migration çalıştırılmamış olabilir' });
        }

        const result = await pool.request()
            .input('Name', sql.NVarChar(200), Name.trim())
            .input('Price', sql.Decimal(10, 2), Price)
            .input('CategoryId', sql.Int, categoryResult.recordset[0].CategoryId)
            .query(`
                INSERT INTO Products (Name, Price, IsSyrup, IsRawMaterial, CategoryId)
                OUTPUT INSERTED.ProductId, INSERTED.Name, INSERTED.Price, INSERTED.IsActive
                VALUES (@Name, @Price, 1, 0, @CategoryId)
            `);

        res.status(201).json(result.recordset[0]);
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
        const { Name, Price } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Şurup adı zorunludur' });
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
                WHERE ProductId = @Id AND IsSyrup = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Şurup bulunamadı' });
        }
        res.status(200).json(result.recordset[0]);
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
