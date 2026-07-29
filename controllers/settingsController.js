const { sql, connectDB } = require('../config/db');

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

// ============================================================
// GENEL GÖRÜNÜM AYARLARI (restoran adı + tema rengi)
// Tek satırlık AppSettings tablosu — tüm kullanıcılar için ortak.
// ============================================================

async function getSettings(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`SELECT TOP 1 RestaurantName, ThemeColor, ProductOptionsPopupEnabled, StockChartEnabled, EArsivVatRate FROM AppSettings ORDER BY AppSettingsId ASC`);

        if (result.recordset.length === 0) {
            return res.status(200).json({ RestaurantName: 'Restoran', ThemeColor: '#FF4713', ProductOptionsPopupEnabled: true, StockChartEnabled: true, EArsivVatRate: 10 });
        }

        const row = result.recordset[0];
        res.status(200).json({ ...row, ProductOptionsPopupEnabled: Boolean(row.ProductOptionsPopupEnabled), StockChartEnabled: Boolean(row.StockChartEnabled), EArsivVatRate: Number(row.EArsivVatRate) });
    } catch (err) {
        console.error('Ayarlar getirilirken hata:', err);
        res.status(500).json({ error: 'Ayarlar getirilemedi' });
    }
}

// ============================================================
// AYARLARI GÜNCELLE (SADECE ADMIN)
// ============================================================
async function updateSettings(req, res) {
    try {
        const { RestaurantName, ThemeColor, ProductOptionsPopupEnabled, StockChartEnabled, EArsivVatRate } = req.body;

        if (!RestaurantName || typeof RestaurantName !== 'string' || !RestaurantName.trim()) {
            return res.status(400).json({ error: 'Restoran adı zorunludur' });
        }
        if (RestaurantName.trim().length > 100) {
            return res.status(400).json({ error: 'Restoran adı en fazla 100 karakter olabilir' });
        }
        if (!ThemeColor || typeof ThemeColor !== 'string' || !HEX_COLOR_REGEX.test(ThemeColor)) {
            return res.status(400).json({ error: 'Tema rengi #RRGGBB formatında olmalıdır' });
        }
        if (ProductOptionsPopupEnabled !== undefined && typeof ProductOptionsPopupEnabled !== 'boolean') {
            return res.status(400).json({ error: 'ProductOptionsPopupEnabled boolean olmalıdır' });
        }
        if (StockChartEnabled !== undefined && typeof StockChartEnabled !== 'boolean') {
            return res.status(400).json({ error: 'StockChartEnabled boolean olmalıdır' });
        }
        if (EArsivVatRate !== undefined && (typeof EArsivVatRate !== 'number' || EArsivVatRate < 0 || EArsivVatRate > 100)) {
            return res.status(400).json({ error: 'EArsivVatRate 0-100 arasında bir sayı olmalıdır' });
        }

        const pool = await connectDB();

        const existing = await pool.request().query(`SELECT TOP 1 AppSettingsId, ProductOptionsPopupEnabled, StockChartEnabled, EArsivVatRate FROM AppSettings ORDER BY AppSettingsId ASC`);

        const popupEnabled = ProductOptionsPopupEnabled !== undefined
            ? ProductOptionsPopupEnabled
            : (existing.recordset.length > 0 ? Boolean(existing.recordset[0].ProductOptionsPopupEnabled) : true);
        const stockChartEnabled = StockChartEnabled !== undefined
            ? StockChartEnabled
            : (existing.recordset.length > 0 ? Boolean(existing.recordset[0].StockChartEnabled) : true);
        const vatRate = EArsivVatRate !== undefined
            ? EArsivVatRate
            : (existing.recordset.length > 0 ? Number(existing.recordset[0].EArsivVatRate) : 10);

        let result;
        if (existing.recordset.length === 0) {
            result = await pool.request()
                .input('RestaurantName', sql.NVarChar(100), RestaurantName.trim())
                .input('ThemeColor', sql.Char(7), ThemeColor.toUpperCase())
                .input('ProductOptionsPopupEnabled', sql.Bit, popupEnabled)
                .input('StockChartEnabled', sql.Bit, stockChartEnabled)
                .input('EArsivVatRate', sql.Decimal(5, 2), vatRate)
                .query(`
                    INSERT INTO AppSettings (RestaurantName, ThemeColor, ProductOptionsPopupEnabled, StockChartEnabled, EArsivVatRate)
                    OUTPUT INSERTED.RestaurantName, INSERTED.ThemeColor, INSERTED.ProductOptionsPopupEnabled, INSERTED.StockChartEnabled, INSERTED.EArsivVatRate
                    VALUES (@RestaurantName, @ThemeColor, @ProductOptionsPopupEnabled, @StockChartEnabled, @EArsivVatRate)
                `);
        } else {
            result = await pool.request()
                .input('Id', sql.Int, existing.recordset[0].AppSettingsId)
                .input('RestaurantName', sql.NVarChar(100), RestaurantName.trim())
                .input('ThemeColor', sql.Char(7), ThemeColor.toUpperCase())
                .input('ProductOptionsPopupEnabled', sql.Bit, popupEnabled)
                .input('StockChartEnabled', sql.Bit, stockChartEnabled)
                .input('EArsivVatRate', sql.Decimal(5, 2), vatRate)
                .query(`
                    UPDATE AppSettings
                    SET RestaurantName = @RestaurantName, ThemeColor = @ThemeColor,
                        ProductOptionsPopupEnabled = @ProductOptionsPopupEnabled,
                        StockChartEnabled = @StockChartEnabled, EArsivVatRate = @EArsivVatRate, UpdatedAt = GETDATE()
                    OUTPUT INSERTED.RestaurantName, INSERTED.ThemeColor, INSERTED.ProductOptionsPopupEnabled, INSERTED.StockChartEnabled, INSERTED.EArsivVatRate
                    WHERE AppSettingsId = @Id
                `);
        }

        const row = result.recordset[0];
        res.status(200).json({ ...row, ProductOptionsPopupEnabled: Boolean(row.ProductOptionsPopupEnabled), StockChartEnabled: Boolean(row.StockChartEnabled), EArsivVatRate: Number(row.EArsivVatRate) });
    } catch (err) {
        console.error('Ayarlar güncellenirken hata:', err);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
}

module.exports = { getSettings, updateSettings };
