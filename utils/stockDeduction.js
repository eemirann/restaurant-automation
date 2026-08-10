const { sql } = require('../config/db');
const { resolveConversionFactor } = require('./unitConversion');

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
        .query(`
            SELECT r.RawMaterialProductId, r.Quantity, r.UnitId, rm.StockUnitId
            FROM Recipes r
            JOIN Products rm ON rm.ProductId = r.RawMaterialProductId
            WHERE r.ProductId = @ProductId
        `);

    if (recipe.recordset.length > 0) {
        const targets = [];
        for (const line of recipe.recordset) {
            // Reçetedeki Quantity'nin girildiği birim (r.UnitId, ör. "porsiyon"
            // ya da "kg") ile hammaddenin STOKTA tutulduğu birim (rm.StockUnitId,
            // ör. "g") farklı olabilir — Birim Dönüşüm Sistemi (bkz.
            // utils/unitConversion.js) bunu otomatik çevirir. r.UnitId NULL ise
            // (eski satırlar) VEYA hammaddenin StockUnitId'si hiç ayarlanmamışsa
            // faktör 1'dir, eski davranış aynen korunur.
            const factor = line.StockUnitId
                ? await resolveConversionFactor(transaction, line.RawMaterialProductId, line.UnitId, line.StockUnitId)
                : 1;
            targets.push({
                productId: line.RawMaterialProductId,
                amount: Number(line.Quantity) * factor * quantity,
            });
        }
        return targets;
    }

    return [{ productId, amount: quantity }];
}

// Bir hammaddenin (ör. bir şurup), verilen menü ürününün Reçetesinde zaten
// sabit olarak tanımlı olup olmadığını söyler. Reçetede varsa, o hammadde
// zaten ürünün kendi stok düşümüyle (bkz. resolveStockTargets) otomatik
// düşülüyor demektir — sipariş ekranındaki seçici (ProductSyrups/ExtraProducts)
// üzerinden AYRICA ücretlendirilmemeli/düşülmemeli (bkz. utils/orderBuilder.js,
// controllers/orderController.js — çifte ücret/çifte stok düşümü fix'i).
async function isRecipeLinked(transaction, productId, rawMaterialProductId) {
    const result = await new sql.Request(transaction)
        .input('ProductId', sql.Int, productId)
        .input('RawMaterialProductId', sql.Int, rawMaterialProductId)
        .query(`SELECT TOP 1 RecipeId FROM Recipes WHERE ProductId = @ProductId AND RawMaterialProductId = @RawMaterialProductId`);
    return result.recordset.length > 0;
}

module.exports = { deductStockForItem, restoreStockForItem, isRecipeLinked };
