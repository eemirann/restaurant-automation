const { sql, connectDB } = require('../config/db');

async function getAllProducts(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query('SELECT * FROM Products');
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
        const { Name, Description, Price, CategoryId } = req.body;

        if (!Name || Price === undefined || Price === null || !CategoryId) {
            return res.status(400).json({ error: 'Ürün adı, fiyat ve kategori zorunludur' });
        }

        if (typeof Price !== 'number' || Price <= 0) {
            return res.status(400).json({ error: 'Fiyat pozitif bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Name', sql.NVarChar, Name)
            .input('Description', sql.NVarChar, Description)
            .input('Price', sql.Decimal(10, 2), Price)
            .input('CategoryId', sql.Int, CategoryId)
            .query('INSERT INTO Products (Name, Description, Price, CategoryId) OUTPUT INSERTED.* VALUES (@Name, @Description, @Price, @CategoryId)');

        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürün oluşturulurken hata', err);
        res.status(500).json({ error: 'Ürün oluşturulamadı' });
    }
}

async function updateProduct(req, res) {
    try {
        const { id } = req.params;
        const { Name, Description, Price, CategoryId } = req.body;

        if (!Name || Price === undefined || Price === null || !CategoryId) {
            return res.status(400).json({ error: 'Ürün adı, fiyat ve kategori zorunludur' });
        }

        if (typeof Price !== 'number' || Price <= 0) {
            return res.status(400).json({ error: 'Fiyat pozitif bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Name', sql.NVarChar, Name)
            .input('Description', sql.NVarChar, Description)
            .input('Price', sql.Decimal(10, 2), Price)
            .input('CategoryId', sql.Int, CategoryId)
            .query('UPDATE Products SET Name = @Name, Description = @Description, Price = @Price, CategoryId = @CategoryId OUTPUT INSERTED.* WHERE ProductId = @Id');

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

module.exports = { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct, reactivateProduct, uploadProductImage };