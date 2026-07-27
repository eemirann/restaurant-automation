const { sql } = require('../config/db');

// ============================================================
// BOM-FARKINDA STOK DÜŞME / GERİ EKLEME YARDIMCILARI
//
// Kural:
//  - Ürünün reçetesi (Recipes) VARSA  -> hammaddeler
//    (RawMaterialProductId) reçetedeki Quantity × satılan adet kadar düşülür.
//  - Ürünün reçetesi YOKSA            -> ürünün kendi stoğu düşülür
//    (eski davranış, geriye uyumluluk).
//
// Hepsi çağıran fonksiyonun AÇIK transaction'ı içinde çalışır
// (new sql.Request(transaction)). Böylece stok değişimi sipariş
// işlemiyle atomik kalır.
// ============================================================

// Bir sipariş kalemi için stok düşer. Düşük stok uyarılarını döndürür.
// warnings: [{ ProductId, RemainingStock, IsNegative }]  (ProductId = hammadde ürünü)
async function deductStockForItem(transaction, productId, quantity) {
    const warnings = [];
    const targets = await resolveStockTargets(transaction, productId, quantity);

    for (const t of targets) {
        const result = await new sql.Request(transaction)
            .input('ProductId', sql.Int, t.productId)
            .input('Amount', sql.Decimal(18, 3), t.amount)
            .query(`
                UPDATE Stock
                SET Quantity = Quantity - @Amount, UpdatedAt = GETDATE()
                OUTPUT INSERTED.Quantity, INSERTED.MinStockLevel
                WHERE ProductId = @ProductId AND IsTracked = 1
            `);

        if (result.recordset.length > 0) {
            const remaining = Number(result.recordset[0].Quantity);
            const minLevel = Number(result.recordset[0].MinStockLevel);
            if (remaining <= minLevel) {
                warnings.push({
                    ProductId: t.productId,
                    RemainingStock: remaining,
                    IsNegative: remaining < 0,
                });
            }
        }
    }

    return warnings;
}

// Bir sipariş kalemi için düşülen stoğu geri ekler (iptal / kalem çıkarma / adet azaltma).
async function restoreStockForItem(transaction, productId, quantity) {
    const targets = await resolveStockTargets(transaction, productId, quantity);

    for (const t of targets) {
        await new sql.Request(transaction)
            .input('ProductId', sql.Int, t.productId)
            .input('Amount', sql.Decimal(18, 3), t.amount)
            .query(`
                UPDATE Stock
                SET Quantity = Quantity + @Amount, UpdatedAt = GETDATE()
                WHERE ProductId = @ProductId AND IsTracked = 1
            `);
    }
}

// Bir menü ürünü + adet için hangi stok kaleminin ne kadar etkileneceğini çözer.
// Reçete varsa hammadde satırlarını, yoksa ürünün kendisini döndürür.
async function resolveStockTargets(transaction, productId, quantity) {
    const recipe = await new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .query(`SELECT RawMaterialProductId, Quantity FROM Recipes WHERE ProductId = @ProductId`);

    if (recipe.recordset.length > 0) {
        return recipe.recordset.map((line) => ({
            productId: line.RawMaterialProductId,
            amount: Number(line.Quantity) * quantity,
        }));
    }

    return [{ productId, amount: quantity }];
}

module.exports = { deductStockForItem, restoreStockForItem };
