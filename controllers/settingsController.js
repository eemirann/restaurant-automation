const { sql, connectDB } = require('../config/db');

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

// ============================================================
// GENEL GÖRÜNÜM AYARLARI (restoran adı + tema rengi)
// Tek satırlık AppSettings tablosu — tüm kullanıcılar için ortak.
// ============================================================

async function getSettings(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`SELECT TOP 1 RestaurantName, ThemeColor FROM AppSettings ORDER BY AppSettingsId ASC`);

        if (result.recordset.length === 0) {
            return res.status(200).json({ RestaurantName: 'Restoran', ThemeColor: '#FF4713' });
        }

        res.status(200).json(result.recordset[0]);
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
        const { RestaurantName, ThemeColor } = req.body;

        if (!RestaurantName || typeof RestaurantName !== 'string' || !RestaurantName.trim()) {
            return res.status(400).json({ error: 'Restoran adı zorunludur' });
        }
        if (RestaurantName.trim().length > 100) {
            return res.status(400).json({ error: 'Restoran adı en fazla 100 karakter olabilir' });
        }
        if (!ThemeColor || typeof ThemeColor !== 'string' || !HEX_COLOR_REGEX.test(ThemeColor)) {
            return res.status(400).json({ error: 'Tema rengi #RRGGBB formatında olmalıdır' });
        }

        const pool = await connectDB();

        const existing = await pool.request().query(`SELECT TOP 1 AppSettingsId FROM AppSettings ORDER BY AppSettingsId ASC`);

        let result;
        if (existing.recordset.length === 0) {
            result = await pool.request()
                .input('RestaurantName', sql.NVarChar(100), RestaurantName.trim())
                .input('ThemeColor', sql.Char(7), ThemeColor.toUpperCase())
                .query(`
                    INSERT INTO AppSettings (RestaurantName, ThemeColor)
                    OUTPUT INSERTED.RestaurantName, INSERTED.ThemeColor
                    VALUES (@RestaurantName, @ThemeColor)
                `);
        } else {
            result = await pool.request()
                .input('Id', sql.Int, existing.recordset[0].AppSettingsId)
                .input('RestaurantName', sql.NVarChar(100), RestaurantName.trim())
                .input('ThemeColor', sql.Char(7), ThemeColor.toUpperCase())
                .query(`
                    UPDATE AppSettings
                    SET RestaurantName = @RestaurantName, ThemeColor = @ThemeColor, UpdatedAt = GETDATE()
                    OUTPUT INSERTED.RestaurantName, INSERTED.ThemeColor
                    WHERE AppSettingsId = @Id
                `);
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Ayarlar güncellenirken hata:', err);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
}

module.exports = { getSettings, updateSettings };
