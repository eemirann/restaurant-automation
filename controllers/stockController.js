const { sql, connectDB } = require('../config/db');

// ============================================================
// TÜM STOK KALEMLERİNİ LİSTELE (ürün adıyla birlikte)
// ============================================================
async function getAllStock(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT s.StockId, s.ProductId, p.Name AS ProductName,
                   s.Quantity, s.MinStockLevel, s.UpdatedAt
            FROM Stock s
            JOIN Products p ON p.ProductId = s.ProductId
            ORDER BY p.Name ASC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Stok listesi getirilirken hata:', err);
        res.status(500).json({ error: 'Stok listesi getirilemedi' });
    }
}

// ============================================================
// YENİ STOK KALEMİ EKLE (SADECE ADMIN)
// Bir ürün için sadece tek bir stok kaydı olabilir (ProductId unique).
//
// İki şekilde ürün belirtilebilir:
//  - ProductId: menüde zaten var olan bir ürün seçilir
//  - ProductName: menüde olmayan, sadece envanter için yeni bir "hammadde"
//    adı yazılır — aynı isimde hammadde varsa o kullanılır, yoksa otomatik
//    oluşturulur (IsRawMaterial=1, "Hammadde" kategorisi altında, menüde
//    hiç görünmez).
//
// Quantity > 0 girildiyse, bu ilk adet de bir "alım" olarak StockPurchases +
// StockMovements'a (IN) kaydedilir (UnitPrice/Supplier/InvoiceNumber/Notes opsiyonel).
// ============================================================
async function createStockItem(req, res) {
    try {
        const { ProductId, ProductName, Quantity, MinStockLevel, UnitPrice, Supplier, InvoiceNumber, Notes } = req.body;

        if (!ProductId && !ProductName) {
            return res.status(400).json({ error: 'Ürün seçmeli veya yeni ürün adı girmelisiniz' });
        }

        const qty = Quantity || 0;
        const minLevel = MinStockLevel || 0;

        if (qty < 0 || minLevel < 0) {
            return res.status(400).json({ error: 'Adet ve minimum stok negatif olamaz' });
        }

        const pool = await connectDB();

        let finalProductId = ProductId;

        // Yeni ürün adı girildiyse: aynı isimde hammadde var mı bak, yoksa oluştur
        if (!finalProductId) {
            const trimmedName = ProductName.trim();
            if (!trimmedName) {
                return res.status(400).json({ error: 'Ürün adı boş olamaz' });
            }

            const existing = await pool.request()
                .input('Name', sql.NVarChar, trimmedName)
                .query(`SELECT ProductId FROM Products WHERE Name = @Name AND IsRawMaterial = 1`);

            if (existing.recordset.length > 0) {
                finalProductId = existing.recordset[0].ProductId;
            } else {
                const rawCategory = await pool.request()
                    .query(`SELECT TOP 1 CategoryId FROM Categories WHERE Name = 'Hammadde'`);

                const created = await pool.request()
                    .input('Name', sql.NVarChar, trimmedName)
                    .input('Price', sql.Decimal(10, 2), 0)
                    .input('CategoryId', sql.Int, rawCategory.recordset[0]?.CategoryId)
                    .query(`
                        INSERT INTO Products (Name, Price, CategoryId, IsRawMaterial)
                        OUTPUT INSERTED.ProductId
                        VALUES (@Name, @Price, @CategoryId, 1)
                    `);
                finalProductId = created.recordset[0].ProductId;
            }
        }

        const result = await pool.request()
            .input('ProductId', sql.Int, finalProductId)
            .input('Quantity', sql.Int, qty)
            .input('MinStockLevel', sql.Int, minLevel)
            .query(`
                INSERT INTO Stock (ProductId, Quantity, MinStockLevel, IsTracked)
                OUTPUT INSERTED.*
                VALUES (@ProductId, @Quantity, @MinStockLevel, 1)
            `);

        const newStock = result.recordset[0];

        // İlk adet bir "alım" gibi kaydedilir (fatura/tedarikçi bilgisiyle birlikte)
        if (qty > 0) {
            await pool.request()
                .input('StockId', sql.Int, newStock.StockId)
                .input('Quantity', sql.Int, qty)
                .input('UnitPrice', sql.Decimal(10, 2), UnitPrice || null)
                .input('Supplier', sql.NVarChar(150), Supplier || null)
                .input('InvoiceNumber', sql.NVarChar(50), InvoiceNumber || null)
                .input('Notes', sql.NVarChar(500), Notes || null)
                .query(`
                    INSERT INTO StockPurchases (StockId, Quantity, UnitPrice, Supplier, InvoiceNumber, Notes)
                    VALUES (@StockId, @Quantity, @UnitPrice, @Supplier, @InvoiceNumber, @Notes)
                `);

            await pool.request()
                .input('StockId', sql.Int, newStock.StockId)
                .input('Quantity', sql.Int, qty)
                .query(`INSERT INTO StockMovements (StockId, Quantity, MovementType) VALUES (@StockId, @Quantity, 'IN')`);
        }

        res.status(201).json(newStock);
    } catch (err) {
        // Aynı ürün için ikinci bir stok kaydı eklenmeye çalışılırsa (unique kısıtı)
        if (err.number === 2627) {
            return res.status(409).json({ error: 'Bu ürün için zaten bir stok kaydı var' });
        }
        console.error('Stok kalemi eklenirken hata:', err);
        res.status(500).json({ error: 'Stok kalemi eklenemedi' });
    }
}

// ============================================================
// STOK KALEMİNİ DÜZENLE (SADECE ADMIN)
// Adet ve minimum stok seviyesini doğrudan düzeltmek için (ör. sayım sonrası).
// ============================================================
async function updateStockItem(req, res) {
    try {
        const { id } = req.params;
        const { Quantity, MinStockLevel } = req.body;

        if (Quantity === undefined || MinStockLevel === undefined) {
            return res.status(400).json({ error: 'Quantity ve MinStockLevel zorunludur' });
        }

        if (Quantity < 0 || MinStockLevel < 0) {
            return res.status(400).json({ error: 'Adet ve minimum stok negatif olamaz' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Quantity', sql.Int, Quantity)
            .input('MinStockLevel', sql.Int, MinStockLevel)
            .query(`
                UPDATE Stock
                SET Quantity = @Quantity, MinStockLevel = @MinStockLevel, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok kalemi güncellenirken hata:', err);
        res.status(500).json({ error: 'Stok kalemi güncellenemedi' });
    }
}

// ============================================================
// STOK KALEMİNİ SİL (SADECE ADMIN)
// ============================================================
async function deleteStockItem(req, res) {
    try {
        const { id } = req.params;

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query('DELETE FROM Stock OUTPUT DELETED.* WHERE StockId = @Id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        res.status(200).json({ message: 'Stok kalemi silindi.' });
    } catch (err) {
        console.error('Stok kalemi silinirken hata:', err);
        res.status(500).json({ error: 'Stok kalemi silinemedi' });
    }
}

// ============================================================
// STOK ADEDİNİ ARTIR (SADECE ADMIN)
// Body: { amount }
// Her artışta bir "IN" hareket kaydı da oluşturulur (stok geçmişi için).
// Tarih/saat otomatik kaydedilir (StockMovements.MovementDate varsayılanı).
// ============================================================
async function increaseStock(req, res) {
    try {
        const { id } = req.params;
        const amount = req.body.amount || 1;

        if (amount <= 0) {
            return res.status(400).json({ error: 'amount pozitif bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Amount', sql.Int, amount)
            .query(`
                UPDATE Stock
                SET Quantity = Quantity + @Amount, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        await pool.request()
            .input('StockId', sql.Int, id)
            .input('Quantity', sql.Int, amount)
            .query(`
                INSERT INTO StockMovements (StockId, Quantity, MovementType)
                VALUES (@StockId, @Quantity, 'IN')
            `);

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok artırılırken hata:', err);
        res.status(500).json({ error: 'Stok artırılamadı' });
    }
}

// ============================================================
// STOK ADEDİNİ AZALT (SADECE ADMIN)
// Body: { amount }
// Stok 0'ın altına düşemez. Her azalışta bir "OUT" hareket kaydı oluşturulur.
// ============================================================
async function decreaseStock(req, res) {
    try {
        const { id } = req.params;
        const amount = req.body.amount || 1;

        if (amount <= 0) {
            return res.status(400).json({ error: 'amount pozitif bir sayı olmalıdır' });
        }

        const pool = await connectDB();

        const current = await pool.request()
            .input('Id', sql.Int, id)
            .query('SELECT Quantity FROM Stock WHERE StockId = @Id');

        if (current.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        if (current.recordset[0].Quantity < amount) {
            return res.status(400).json({ error: 'Stok miktarı 0\'ın altına düşürülemez' });
        }

        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Amount', sql.Int, amount)
            .query(`
                UPDATE Stock
                SET Quantity = Quantity - @Amount, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        await pool.request()
            .input('StockId', sql.Int, id)
            .input('Quantity', sql.Int, amount)
            .query(`
                INSERT INTO StockMovements (StockId, Quantity, MovementType)
                VALUES (@StockId, @Quantity, 'OUT')
            `);

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok azaltılırken hata:', err);
        res.status(500).json({ error: 'Stok azaltılamadı' });
    }
}

// ============================================================
// TÜM STOK HAREKETLERİNİ LİSTELE (ürün adıyla birlikte, en yeni önce)
// ============================================================
async function getAllStockMovements(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT sm.StockMovementId, sm.StockId, p.Name AS ProductName,
                   sm.Quantity, sm.MovementType, sm.MovementDate
            FROM StockMovements sm
            JOIN Stock s ON s.StockId = sm.StockId
            JOIN Products p ON p.ProductId = s.ProductId
            ORDER BY sm.MovementDate DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Stok hareketleri getirilirken hata:', err);
        res.status(500).json({ error: 'Stok hareketleri getirilemedi' });
    }
}

// ============================================================
// STOK ALIMI KAYDET (SADECE ADMIN)
// "+" butonundaki sağdan kayan çekmece bunu çağırır.
// Body: { Quantity, UnitPrice?, Supplier?, InvoiceNumber?, Notes? }
// Stok adedini artırır + StockPurchases'a kaydeder + StockMovements'a "IN" hareketi düşer.
// ============================================================
async function recordStockPurchase(req, res) {
    try {
        const { id } = req.params;
        const { Quantity, UnitPrice, Supplier, InvoiceNumber, Notes } = req.body;

        if (!Number.isInteger(Quantity) || Quantity <= 0) {
            return res.status(400).json({ error: 'Quantity pozitif bir tam sayı olmalıdır' });
        }

        const pool = await connectDB();

        const stockResult = await pool.request()
            .input('Id', sql.Int, id)
            .input('Amount', sql.Int, Quantity)
            .query(`
                UPDATE Stock
                SET Quantity = Quantity + @Amount, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        if (stockResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        await pool.request()
            .input('StockId', sql.Int, id)
            .input('Quantity', sql.Int, Quantity)
            .input('UnitPrice', sql.Decimal(10, 2), UnitPrice || null)
            .input('Supplier', sql.NVarChar(150), Supplier || null)
            .input('InvoiceNumber', sql.NVarChar(50), InvoiceNumber || null)
            .input('Notes', sql.NVarChar(500), Notes || null)
            .query(`
                INSERT INTO StockPurchases (StockId, Quantity, UnitPrice, Supplier, InvoiceNumber, Notes)
                VALUES (@StockId, @Quantity, @UnitPrice, @Supplier, @InvoiceNumber, @Notes)
            `);

        await pool.request()
            .input('StockId', sql.Int, id)
            .input('Quantity', sql.Int, Quantity)
            .query(`
                INSERT INTO StockMovements (StockId, Quantity, MovementType)
                VALUES (@StockId, @Quantity, 'IN')
            `);

        res.status(201).json(stockResult.recordset[0]);
    } catch (err) {
        console.error('Stok alımı kaydedilirken hata:', err);
        res.status(500).json({ error: 'Stok alımı kaydedilemedi' });
    }
}

module.exports = {
    getAllStock,
    createStockItem,
    updateStockItem,
    deleteStockItem,
    increaseStock,
    decreaseStock,
    getAllStockMovements,
    recordStockPurchase
};
