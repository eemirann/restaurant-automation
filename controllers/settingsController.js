const { sql, connectDB } = require('../config/db');

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

// ============================================================
// GENEL GÖRÜNÜM AYARLARI (restoran adı + tema rengi)
// Tek satırlık AppSettings tablosu — tüm kullanıcılar için ortak.
// ============================================================

async function getSettings(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`SELECT TOP 1 RestaurantName, ThemeColor, ProductOptionsPopupEnabled FROM AppSettings ORDER BY AppSettingsId ASC`);

        if (result.recordset.length === 0) {
            return res.status(200).json({ RestaurantName: 'Restoran', ThemeColor: '#FF4713', ProductOptionsPopupEnabled: true });
        }

        const row = result.recordset[0];
        res.status(200).json({ ...row, ProductOptionsPopupEnabled: Boolean(row.ProductOptionsPopupEnabled) });
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
        const { RestaurantName, ThemeColor, ProductOptionsPopupEnabled } = req.body;

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

        const pool = await connectDB();

        const existing = await pool.request().query(`SELECT TOP 1 AppSettingsId, ProductOptionsPopupEnabled FROM AppSettings ORDER BY AppSettingsId ASC`);

        const popupEnabled = ProductOptionsPopupEnabled !== undefined
            ? ProductOptionsPopupEnabled
            : (existing.recordset.length > 0 ? Boolean(existing.recordset[0].ProductOptionsPopupEnabled) : true);

        let result;
        if (existing.recordset.length === 0) {
            result = await pool.request()
                .input('RestaurantName', sql.NVarChar(100), RestaurantName.trim())
                .input('ThemeColor', sql.Char(7), ThemeColor.toUpperCase())
                .input('ProductOptionsPopupEnabled', sql.Bit, popupEnabled)
                .query(`
                    INSERT INTO AppSettings (RestaurantName, ThemeColor, ProductOptionsPopupEnabled)
                    OUTPUT INSERTED.RestaurantName, INSERTED.ThemeColor, INSERTED.ProductOptionsPopupEnabled
                    VALUES (@RestaurantName, @ThemeColor, @ProductOptionsPopupEnabled)
                `);
        } else {
            result = await pool.request()
                .input('Id', sql.Int, existing.recordset[0].AppSettingsId)
                .input('RestaurantName', sql.NVarChar(100), RestaurantName.trim())
                .input('ThemeColor', sql.Char(7), ThemeColor.toUpperCase())
                .input('ProductOptionsPopupEnabled', sql.Bit, popupEnabled)
                .query(`
                    UPDATE AppSettings
                    SET RestaurantName = @RestaurantName, ThemeColor = @ThemeColor,
                        ProductOptionsPopupEnabled = @ProductOptionsPopupEnabled, UpdatedAt = GETDATE()
                    OUTPUT INSERTED.RestaurantName, INSERTED.ThemeColor, INSERTED.ProductOptionsPopupEnabled
                    WHERE AppSettingsId = @Id
                `);
        }

        const row = result.recordset[0];
        res.status(200).json({ ...row, ProductOptionsPopupEnabled: Boolean(row.ProductOptionsPopupEnabled) });
    } catch (err) {
        console.error('Ayarlar güncellenirken hata:', err);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
}

module.exports = { getSettings, updateSettings };
