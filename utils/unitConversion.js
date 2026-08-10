const { sql } = require('../config/db');
const { HttpError } = require('./httpError');

// ============================================================
// BİRİM DÖNÜŞÜM MOTORU (bkz. migrations/2026_08_14_unit_conversion_system.sql)
//
// Tek Sorumluluk: bu modül SADECE "X birimindeki Y miktarını Z birimine
// çevir" işini bilir — stok düşme/maliyet hesaplama gibi işlerle
// İLGİLENMEZ, onlar bu modülü ÇAĞIRIR (bkz. utils/stockDeduction.js).
//
// Açık/Kapalı (Open/Closed): yeni bir birim ya da yeni bir ürün-özel
// dönüşüm eklemek bu dosyada TEK SATIR bile değiştirmeyi gerektirmez —
// sadece Units/ProductUnitConversions tablolarına satır eklenir.
//
// İki katmanlı çözümleme:
//   1) EVRENSEL — aynı UnitType'ta, ikisinin de ConversionFactorToBase'i
//      dolu (ör. kg -> g).
//   2) ÜRÜNE ÖZEL — ProductUnitConversions'ta (ör. "bu ürünün 1 pump'ı
//      15 ml").
// İkisi de yoksa faktör 1 kabul edilir (eski/yapılandırılmamış ürünler
// için geriye dönük uyumluluk — bkz. migration'daki fn_ProductUnitFactor
// ile AYNI güvenli varsayılan).
// ============================================================

/**
 * @param {sql.Transaction | sql.ConnectionPool} runner - transaction içindeyse Transaction, değilse pool
 * @param {number} productId
 * @param {number|null} fromUnitId - null ise 1 döner (birim belirtilmemiş = zaten hedef birimde)
 * @param {number} toUnitId
 * @returns {Promise<number>} 1 FromUnit = <dönen değer> * ToUnit
 */
async function resolveConversionFactor(runner, productId, fromUnitId, toUnitId) {
    if (fromUnitId == null || fromUnitId === toUnitId) return 1;

    const units = await new sql.Request(runner)
        .input('FromId', sql.Int, fromUnitId)
        .input('ToId', sql.Int, toUnitId)
        .query(`SELECT UnitId, UnitType, ConversionFactorToBase FROM Units WHERE UnitId IN (@FromId, @ToId)`);

    const from = units.recordset.find((u) => u.UnitId === fromUnitId);
    const to = units.recordset.find((u) => u.UnitId === toUnitId);

    if (!from || !to) {
        throw new HttpError(400, 'Geçersiz birim.');
    }

    // 1) Evrensel dönüşüm
    if (from.UnitType === to.UnitType && from.ConversionFactorToBase != null && to.ConversionFactorToBase != null) {
        return Number(from.ConversionFactorToBase) / Number(to.ConversionFactorToBase);
    }

    // 2) Ürüne özel dönüşüm
    const custom = await new sql.Request(runner)
        .input('ProductId', sql.Int, productId)
        .input('FromId', sql.Int, fromUnitId)
        .input('ToId', sql.Int, toUnitId)
        .query(`SELECT Factor FROM ProductUnitConversions WHERE ProductId = @ProductId AND FromUnitId = @FromId AND ToUnitId = @ToId`);

    if (custom.recordset.length > 0) return Number(custom.recordset[0].Factor);

    // Tanımsız dönüşüm: sessizce yanlış hesap yapmak yerine NET bir hata.
    throw new HttpError(400, `"${from.Code}" biriminden "${to.Code}" birimine bu ürün için tanımlı bir dönüşüm yok. Ürünün Stok Birimi ve/veya ürüne özel dönüşüm oranı ayarlanmalı.`);
}

/**
 * Girilen miktarı (ör. "2 porsiyon") ürünün STOK BİRİMİNE (ör. ml) çevirir.
 * unitId belirtilmemişse (null/undefined) miktar zaten stok biriminde
 * kabul edilir (eski davranış, geriye dönük uyumluluk).
 */
async function toStockUnit(runner, productId, quantity, unitId) {
    if (unitId == null) return quantity;

    const productResult = await new sql.Request(runner)
        .input('ProductId', sql.Int, productId)
        .query(`SELECT StockUnitId FROM Products WHERE ProductId = @ProductId`);

    const stockUnitId = productResult.recordset[0]?.StockUnitId;
    if (!stockUnitId) return quantity; // ürün için stok birimi hiç ayarlanmamış -> eski davranış

    const factor = await resolveConversionFactor(runner, productId, unitId, stockUnitId);
    return quantity * factor;
}

// "porsiyon" (1 pump/tot/servis) — şurup/ekstra sipariş kalemlerinde
// müşterinin/garsonun seçtiği "1x, 2x..." adet bu birimdedir (bkz.
// migration seed verisi). Statik/değişmeyen bir satır olduğu için process
// ömrü boyunca güvenle önbelleklenir (gereksiz DB round-trip'i önler).
let cachedPorsiyonUnitId = null;
async function getPorsiyonUnitId(runner) {
    if (cachedPorsiyonUnitId != null) return cachedPorsiyonUnitId;
    const result = await new sql.Request(runner).query(`SELECT UnitId FROM Units WHERE Code = N'porsiyon'`);
    cachedPorsiyonUnitId = result.recordset[0]?.UnitId ?? null;
    return cachedPorsiyonUnitId;
}

module.exports = { resolveConversionFactor, toStockUnit, getPorsiyonUnitId };
