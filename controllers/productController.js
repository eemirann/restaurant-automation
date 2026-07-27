const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

// Not: Hammadde (IsRawMaterial=1) ürünler varsayılan olarak listelenmez — bunlar
// Stok modülünden eklenen envanter malzemeleridir, menüde/sipariş ekranında görünmemeli.
// Opsiyonel ?raw parametresi (reçete/BOM ekranı için):
//   raw=1   -> yalnızca hammaddeler
//   raw=all -> hepsi (menü + hammadde)
async function getAllProducts(req, res) {
    try {
        const { raw } = req.query;
        let where = 'WHERE IsRawMaterial = 0';
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
        const { Name, Description, Price, CategoryId, Cost } = req.body;

        if (!Name || Price === undefined || Price === null || !CategoryId) {
            return res.status(400).json({ error: 'Ürün adı, fiyat ve kategori zorunludur' });
        }

        if (typeof Price !== 'number' || Price <= 0) {
            return res.status(400).json({ error: 'Fiyat pozitif bir sayı olmalıdır' });
        }

        if (Cost !== undefined && Cost !== null && (typeof Cost !== 'number' || Cost < 0)) {
            return res.status(400).json({ error: 'Maliyet negatif olmayan bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Name', sql.NVarChar, Name)
            .input('Description', sql.NVarChar, Description)
            .input('Price', sql.Decimal(10, 2), Price)
            .input('CategoryId', sql.Int, CategoryId)
            .input('Cost', sql.Decimal(10, 2), Cost ?? null)
            .query('INSERT INTO Products (Name, Description, Price, CategoryId, Cost) OUTPUT INSERTED.* VALUES (@Name, @Description, @Price, @CategoryId, @Cost)');

        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürün oluşturulurken hata', err);
        res.status(500).json({ error: 'Ürün oluşturulamadı' });
    }
}

async function updateProduct(req, res) {
    try {
        const { id } = req.params;
        const { Name, Description, Price, CategoryId, Cost } = req.body;

        if (!Name || Price === undefined || Price === null || !CategoryId) {
            return res.status(400).json({ error: 'Ürün adı, fiyat ve kategori zorunludur' });
        }

        if (typeof Price !== 'number' || Price <= 0) {
            return res.status(400).json({ error: 'Fiyat pozitif bir sayı olmalıdır' });
        }

        if (Cost !== undefined && Cost !== null && (typeof Cost !== 'number' || Cost < 0)) {
            return res.status(400).json({ error: 'Maliyet negatif olmayan bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Name', sql.NVarChar, Name)
            .input('Description', sql.NVarChar, Description)
            .input('Price', sql.Decimal(10, 2), Price)
            .input('CategoryId', sql.Int, CategoryId)
            .input('Cost', sql.Decimal(10, 2), Cost ?? null)
            .query('UPDATE Products SET Name = @Name, Description = @Description, Price = @Price, CategoryId = @CategoryId, Cost = @Cost OUTPUT INSERTED.* WHERE ProductId = @Id');

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

module.exports = { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct, reactivateProduct, uploadProductImage, setProductAvailability };