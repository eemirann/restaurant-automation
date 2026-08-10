const { sql } = require('../config/db');

// ============================================================
// Bir hammaddenin STOK BİRİMİNİ (Products.StockUnitId) ve — gerekiyorsa —
// o birimle reçetelerde kullanılacak birim arasındaki ÖZEL dönüşümü
// (ProductUnitConversions) ayarlar.
//
// Neden gerekli: "adet" ve "porsiyon" gibi birimler farklı UnitType'ta
// olduğu için (bkz. Units tablosu: adet=Count, ml/l=Volume, g/kg=Weight)
// evrensel dönüşüm (utils/unitConversion.js) devreye giremez — ör. "1 adet
// süt = 1000 ml" gibi ürüne özel bir oran tanımlanmadıkça reçetedeki "200 ml"
// ile stoktaki "1 adet" arasında hiçbir bağ kurulamaz (stockDeduction.js
// bu durumda faktörü sessizce 1 kabul ediyordu — 200 ml, 200 "adet" gibi
// düşülüyordu, YANLIŞ).
//
// Her iki yön de yazılır (stok->hedef VE hedef->stok) — reçete tarafı
// hangi yönden sorarsa sorsun (bkz. utils/unitConversion.js resolveConversionFactor,
// FROM=reçete birimi, TO=stok birimi) çalışsın diye, ayrıca Stok sayfasında
// "kaç litre/kg tuttuğu" gibi bir bilgi göstermek istenirse o da hazır olsun diye.
// ============================================================
async function setProductStockUnit(pool, productId, stockUnitId, conversionTargetUnitId, conversionFactor) {
    await pool.request()
        .input('ProductId', sql.Int, productId)
        .input('StockUnitId', sql.Int, stockUnitId)
        .query(`UPDATE Products SET StockUnitId = @StockUnitId WHERE ProductId = @ProductId`);

    if (conversionTargetUnitId == null) return;

    const upsert = async (fromId, toId, factor) => {
        await pool.request()
            .input('ProductId', sql.Int, productId)
            .input('FromId', sql.Int, fromId)
            .input('ToId', sql.Int, toId)
            .input('Factor', sql.Decimal(18, 6), factor)
            .query(`
                MERGE ProductUnitConversions AS target
                USING (SELECT @ProductId AS ProductId, @FromId AS FromUnitId, @ToId AS ToUnitId) AS src
                ON target.ProductId = src.ProductId AND target.FromUnitId = src.FromUnitId AND target.ToUnitId = src.ToUnitId
                WHEN MATCHED THEN UPDATE SET Factor = @Factor
                WHEN NOT MATCHED THEN INSERT (ProductId, FromUnitId, ToUnitId, Factor) VALUES (@ProductId, @FromId, @ToId, @Factor);
            `);
    };

    // "1 stok birimi = conversionFactor hedef birim" (ör. 1 adet = 1000 ml)
    await upsert(stockUnitId, conversionTargetUnitId, conversionFactor);
    // Ters yön — reçetede hedef birim (ml) seçildiğinde stok düşümünün
    // ihtiyaç duyduğu yön TAM OLARAK bu (bkz. utils/unitConversion.js).
    await upsert(conversionTargetUnitId, stockUnitId, 1 / conversionFactor);
}

module.exports = { setProductStockUnit };
