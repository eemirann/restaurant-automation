// ============================================================
// "1 porsiyon kaç stok birimi" yardımcıları — Şurup, Ekstra ve Stok
// (yeni şurup/ekstra ekleme) uçlarının ÜÇÜ de birebir aynı mantığı
// kullanıyordu (kopya kod); tek yerde toplanıp import edilir (bkz.
// utils/unitConversion.js — Birim Dönüşüm Sistemi'nin bir parçası).
// ============================================================
const { sql } = require('../config/db');

// "porsiyon" ve "ml" birimlerinin ID'lerini getirir (statik seed verisi).
async function getUnitIds(pool) {
    const result = await pool.request().query(`SELECT UnitId, Code FROM Units WHERE Code IN (N'porsiyon', N'ml')`);
    const porsiyon = result.recordset.find((u) => u.Code === 'porsiyon')?.UnitId;
    const ml = result.recordset.find((u) => u.Code === 'ml')?.UnitId;
    if (!porsiyon || !ml) throw new Error('"porsiyon"/"ml" birimleri bulunamadı, migration çalıştırılmamış olabilir');
    return { porsiyon, ml };
}

// Products.StockUnitId = ml yapar ve ProductUnitConversions'a (porsiyon -> ml,
// Factor=servingSize) upsert eder. servingSize null/undefined ise mevcut
// dönüşüm satırı SİLİNİR (kullanıcı "porsiyon tüketimini" temizlemiş demektir).
async function upsertServingSize(pool, productId, servingSize, { porsiyon, ml }) {
    if (servingSize == null) {
        await pool.request()
            .input('ProductId', sql.Int, productId)
            .input('FromUnitId', sql.Int, porsiyon)
            .query(`DELETE FROM ProductUnitConversions WHERE ProductId = @ProductId AND FromUnitId = @FromUnitId`);
        return;
    }

    await pool.request()
        .input('ProductId', sql.Int, productId)
        .input('StockUnitId', sql.Int, ml)
        .query(`UPDATE Products SET StockUnitId = @StockUnitId WHERE ProductId = @ProductId`);

    await pool.request()
        .input('ProductId', sql.Int, productId)
        .input('FromUnitId', sql.Int, porsiyon)
        .input('ToUnitId', sql.Int, ml)
        .input('Factor', sql.Decimal(18, 6), servingSize)
        .query(`
            MERGE ProductUnitConversions AS target
            USING (SELECT @ProductId AS ProductId, @FromUnitId AS FromUnitId, @ToUnitId AS ToUnitId) AS src
            ON target.ProductId = src.ProductId AND target.FromUnitId = src.FromUnitId AND target.ToUnitId = src.ToUnitId
            WHEN MATCHED THEN UPDATE SET Factor = @Factor
            WHEN NOT MATCHED THEN INSERT (ProductId, FromUnitId, ToUnitId, Factor) VALUES (@ProductId, @FromUnitId, @ToUnitId, @Factor);
        `);
}

module.exports = { getUnitIds, upsertServingSize };
