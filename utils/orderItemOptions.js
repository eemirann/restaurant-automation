const { sql } = require('../config/db');

// ============================================================
// Bir siparişin kalemlerine (OrderDetails) seçilen ekstra/şurupları
// (OrderDetailExtras/OrderDetailSyrups) ekler. getOrderById (orderController)
// ve getTableById (tableController) aynı görünümü döndürmeli — masaya
// dönüldüğünde de sipariş detayı açıldığında da hangi ekstra/şurubun
// seçildiği görünsün diye ikisi de bu yardımcıyı kullanır.
//
// `db`: pool ya da transaction (ikisi de .request() sağlar).
// `items`: OrderDetails satırları (en az OrderDetailsId alanı olmalı).
// Döner: her item'a Extras/Syrups dizisi eklenmiş yeni bir dizi.
// ============================================================
async function attachOrderItemOptions(db, orderId, items) {
    if (!items || items.length === 0) return items || [];

    const extrasResult = await db.request()
        .input('OrderId', sql.Int, orderId)
        .query(`
            SELECT ode.OrderDetailsId, ode.ExtraProductId, p.Name AS ExtraName, ode.Quantity, ode.UnitPrice
            FROM OrderDetailExtras ode
            JOIN OrderDetails od ON od.OrderDetailsId = ode.OrderDetailsId
            JOIN Products p ON p.ProductId = ode.ExtraProductId
            WHERE od.OrderId = @OrderId
        `);

    const extrasByDetailId = new Map();
    for (const extra of extrasResult.recordset) {
        if (!extrasByDetailId.has(extra.OrderDetailsId)) extrasByDetailId.set(extra.OrderDetailsId, []);
        extrasByDetailId.get(extra.OrderDetailsId).push(extra);
    }

    const syrupsResult = await db.request()
        .input('OrderId', sql.Int, orderId)
        .query(`
            SELECT ods.OrderDetailsId, ods.SyrupProductId, p.Name AS SyrupName, ods.Quantity, ods.UnitPrice
            FROM OrderDetailSyrups ods
            JOIN OrderDetails od ON od.OrderDetailsId = ods.OrderDetailsId
            JOIN Products p ON p.ProductId = ods.SyrupProductId
            WHERE od.OrderId = @OrderId
        `);

    const syrupsByDetailId = new Map();
    for (const syrup of syrupsResult.recordset) {
        if (!syrupsByDetailId.has(syrup.OrderDetailsId)) syrupsByDetailId.set(syrup.OrderDetailsId, []);
        syrupsByDetailId.get(syrup.OrderDetailsId).push(syrup);
    }

    return items.map((item) => ({
        ...item,
        Extras: extrasByDetailId.get(item.OrderDetailsId) || [],
        Syrups: syrupsByDetailId.get(item.OrderDetailsId) || [],
    }));
}

module.exports = { attachOrderItemOptions };
