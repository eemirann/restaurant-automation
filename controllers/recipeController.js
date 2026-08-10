const { sql, connectDB } = require('../config/db');

// ============================================================
// BİR MENÜ ÜRÜNÜNÜN REÇETESİNİ GETİR
// Ürünün tükettiği hammaddeleri, miktarlarını ve o hammaddenin
// güncel stoğunu birlikte döner.
// ============================================================
async function getRecipeByProduct(req, res) {
    try {
        const { productId } = req.params;
        const pool = await connectDB();

        // ConversionFactor: r.UnitId (girilen birim, ör. "porsiyon") ile
        // rm.StockUnitId (hammaddenin stok birimi, ör. "ml") arasındaki oran —
        // bkz. dbo.fn_ProductUnitFactor (inline TVF, migrations/2026_08_14_
        // unit_conversion_system.sql). r.UnitId NULL ise (eski satırlar) 1
        // döner, yani Quantity zaten stok birimindeymiş gibi davranılır.
        const result = await pool.request()
            .input('ProductId', sql.Int, productId)
            .query(`
                SELECT r.RecipeId, r.ProductId, r.RawMaterialProductId,
                       rm.Name AS RawMaterialName, r.Quantity, r.UnitId,
                       u.Code AS UnitCode, rm.StockUnitId, su.Code AS StockUnitCode,
                       s.Quantity AS RawMaterialStock, rm.Cost AS RawMaterialCost,
                       f.Factor AS ConversionFactor
                FROM Recipes r
                JOIN Products rm ON rm.ProductId = r.RawMaterialProductId
                LEFT JOIN Stock s ON s.ProductId = r.RawMaterialProductId
                LEFT JOIN Units u ON u.UnitId = r.UnitId
                LEFT JOIN Units su ON su.UnitId = rm.StockUnitId
                OUTER APPLY dbo.fn_ProductUnitFactor(rm.ProductId, r.UnitId, rm.StockUnitId) f
                WHERE r.ProductId = @ProductId
                ORDER BY rm.Name ASC
            `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Reçete getirilirken hata:', err);
        res.status(500).json({ error: 'Reçete getirilemedi' });
    }
}

// ============================================================
// REÇETEYE HAMMADDE SATIRI EKLE (SADECE ADMIN)
// Body: { ProductId, RawMaterialProductId, Quantity, UnitId? }
// UnitId: Quantity'nin girildiği birim (bkz. GET /api/units) — ör.
// hammadde stokta "g" tutuluyorsa ama burada "kg" ya da ürüne özel
// "porsiyon" seçilebilir, Birim Dönüşüm Sistemi otomatik çevirir (bkz.
// utils/unitConversion.js). Belirtilmezse Quantity zaten stok biriminde
// kabul edilir (eski davranış).
// ============================================================
async function addRecipeItem(req, res) {
    try {
        const { ProductId, RawMaterialProductId, Quantity, UnitId } = req.body;

        if (!Number.isInteger(ProductId) || !Number.isInteger(RawMaterialProductId)) {
            return res.status(400).json({ error: 'ProductId ve RawMaterialProductId sayısal olmalıdır' });
        }
        if (ProductId === RawMaterialProductId) {
            return res.status(400).json({ error: 'Bir ürün kendi reçetesinde hammadde olamaz' });
        }
        if (typeof Quantity !== 'number' || Quantity <= 0) {
            return res.status(400).json({ error: 'Quantity 0\'dan büyük bir sayı olmalıdır' });
        }
        if (UnitId !== undefined && UnitId !== null && !Number.isInteger(UnitId)) {
            return res.status(400).json({ error: 'UnitId sayısal olmalıdır' });
        }

        const pool = await connectDB();

        // Her iki ürünün de var olduğunu doğrula
        const check = await pool.request()
            .input('ProductId', sql.Int, ProductId)
            .input('RawMaterialProductId', sql.Int, RawMaterialProductId)
            .query(`
                SELECT
                    (SELECT COUNT(*) FROM Products WHERE ProductId = @ProductId) AS ProductExists,
                    (SELECT COUNT(*) FROM Products WHERE ProductId = @RawMaterialProductId) AS RawExists
            `);

        if (check.recordset[0].ProductExists === 0) {
            return res.status(404).json({ error: 'Menü ürünü bulunamadı' });
        }
        if (check.recordset[0].RawExists === 0) {
            return res.status(404).json({ error: 'Hammadde ürünü bulunamadı' });
        }

        const result = await pool.request()
            .input('ProductId', sql.Int, ProductId)
            .input('RawMaterialProductId', sql.Int, RawMaterialProductId)
            .input('Quantity', sql.Decimal(10, 3), Quantity)
            .input('UnitId', sql.Int, UnitId ?? null)
            .query(`
                INSERT INTO Recipes (ProductId, RawMaterialProductId, Quantity, UnitId)
                OUTPUT INSERTED.*
                VALUES (@ProductId, @RawMaterialProductId, @Quantity, @UnitId)
            `);

        res.status(201).json(result.recordset[0]);
    } catch (err) {
        // Aynı ürün-hammadde ikilisi zaten reçetede varsa (unique kısıtı)
        if (err.number === 2627 || err.number === 2601) {
            return res.status(409).json({ error: 'Bu hammadde bu ürünün reçetesinde zaten var' });
        }
        console.error('Reçete satırı eklenirken hata:', err);
        res.status(500).json({ error: 'Reçete satırı eklenemedi' });
    }
}

// ============================================================
// REÇETE SATIRINI GÜNCELLE (SADECE ADMIN)
// Body: { Quantity?, UnitId? }
// UnitId'yi AÇIKÇA null göndermek "birim yok, Quantity zaten stok
// biriminde" anlamına dönüştürür (bkz. getRecipeByProduct'taki not) —
// bu yüzden undefined/null ayrımı özenle korunur (JSON.stringify(null)
// body'de gerçekten "UnitId":null olarak gelir, undefined ise hiç
// gönderilmemiş demektir).
// ============================================================
async function updateRecipeItem(req, res) {
    try {
        const { id } = req.params;
        const { Quantity, UnitId } = req.body;

        if (Quantity !== undefined && (typeof Quantity !== 'number' || Quantity <= 0)) {
            return res.status(400).json({ error: 'Quantity 0\'dan büyük bir sayı olmalıdır' });
        }
        if (UnitId !== undefined && UnitId !== null && !Number.isInteger(UnitId)) {
            return res.status(400).json({ error: 'UnitId sayısal olmalıdır' });
        }

        const pool = await connectDB();
        const request = pool.request()
            .input('Id', sql.Int, id)
            .input('Quantity', sql.Decimal(10, 3), Quantity !== undefined ? Quantity : null);

        let setClause = 'Quantity = ISNULL(@Quantity, Quantity)';
        if (UnitId !== undefined) {
            request.input('UnitId', sql.Int, UnitId);
            setClause += ', UnitId = @UnitId';
        }

        const result = await request.query(`
            UPDATE Recipes SET ${setClause}
            OUTPUT INSERTED.*
            WHERE RecipeId = @Id
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Reçete satırı bulunamadı' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Reçete satırı güncellenirken hata:', err);
        res.status(500).json({ error: 'Reçete satırı güncellenemedi' });
    }
}

// ============================================================
// REÇETE SATIRINI SİL (SADECE ADMIN)
// ============================================================
async function deleteRecipeItem(req, res) {
    try {
        const { id } = req.params;
        const pool = await connectDB();

        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query('DELETE FROM Recipes OUTPUT DELETED.* WHERE RecipeId = @Id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Reçete satırı bulunamadı' });
        }

        res.status(200).json({ message: 'Reçete satırı silindi.' });
    } catch (err) {
        console.error('Reçete satırı silinirken hata:', err);
        res.status(500).json({ error: 'Reçete satırı silinemedi' });
    }
}

module.exports = {
    getRecipeByProduct,
    addRecipeItem,
    updateRecipeItem,
    deleteRecipeItem
};
