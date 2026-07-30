const { sql } = require('../config/db');
const { emitStockAlert } = require('../config/socket');

// ============================================================
// deductStockForItem'ın döndürdüğü warnings ([{ProductId, RemainingStock,
// IsNegative}]) ürün adıyla zenginleştirilip emitStockAlert ile yayınlanır.
// Transaction ARTIK COMMIT EDİLMİŞ olmalı (bkz. orderController.createOrder,
// customerOrderController.approveCustomerOrderRequest, loyaltyController.
// redeemLoyaltyProduct) — bu yüzden burada açık transaction yerine düz
// pool.request() kullanılır.
// ============================================================
async function notifyLowStock(pool, lowStockWarnings) {
    if (!lowStockWarnings || lowStockWarnings.length === 0) return;

    try {
        const productIds = [...new Set(lowStockWarnings.map((w) => Number(w.ProductId)))];
        const namesResult = await pool.request()
            .query(`SELECT ProductId, Name FROM Products WHERE ProductId IN (${productIds.join(',')})`);
        const nameById = new Map(namesResult.recordset.map((r) => [r.ProductId, r.Name]));

        const warnings = lowStockWarnings.map((w) => ({
            ProductId: w.ProductId,
            Name: nameById.get(w.ProductId) || null,
            RemainingStock: w.RemainingStock,
            IsNegative: w.IsNegative,
        }));

        emitStockAlert({ warnings });
    } catch (e) {
        console.error('Düşük stok bildirimi yayınlanamadı:', e.message);
    }
}

module.exports = { notifyLowStock };
