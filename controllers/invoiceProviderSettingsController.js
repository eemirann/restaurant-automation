const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');

// ============================================================
// e-FATURA SAĞLAYICI AYARLARI — SADECE ADMIN.
//
// BİLEREK genel AppSettings'ten (GET /api/settings, kimlik doğrulamasız)
// AYRI tutuluyor: burada bir API anahtarı saklanıyor, o uç herkese açık
// olduğu için oraya asla eklenmemeli. Bu uç hem GET hem PUT için
// verifyToken + requireRole('Admin') zorunlu kılıyor (bkz. routes/
// invoiceProviderSettings.js).
//
// Şu an gerçek bir entegratör bağlı değil (bkz. utils/invoiceProvider.js
// — mock). Burada saklanan ProviderName/ApiKey henüz hiçbir API çağrısında
// kullanılmıyor; entegratör seçilince invoiceProvider.js bu ayarları
// okuyacak şekilde güncellenecek.
// ============================================================

const ALLOWED_ENVIRONMENTS = ['sandbox', 'production'];

async function getInvoiceProviderSettings(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`SELECT TOP 1 ProviderName, ApiKey, Environment FROM InvoiceProviderSettings ORDER BY Id ASC`);

        if (result.recordset.length === 0) {
            return res.status(200).json({ ProviderName: null, ApiKey: null, Environment: 'sandbox' });
        }
        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('e-Fatura sağlayıcı ayarları getirilirken hata:', err);
        res.status(500).json({ error: 'Ayarlar getirilemedi' });
    }
}

async function updateInvoiceProviderSettings(req, res) {
    try {
        const { ProviderName, ApiKey, Environment } = req.body;

        if (ProviderName !== undefined && ProviderName !== null && (typeof ProviderName !== 'string' || ProviderName.length > 50)) {
            return res.status(400).json({ error: 'ProviderName en fazla 50 karakter olabilen bir metin olmalıdır' });
        }
        if (ApiKey !== undefined && ApiKey !== null && (typeof ApiKey !== 'string' || ApiKey.length > 300)) {
            return res.status(400).json({ error: 'ApiKey en fazla 300 karakter olabilen bir metin olmalıdır' });
        }
        if (Environment !== undefined && !ALLOWED_ENVIRONMENTS.includes(Environment)) {
            return res.status(400).json({ error: `Environment şunlardan biri olmalı: ${ALLOWED_ENVIRONMENTS.join(', ')}` });
        }

        const pool = await connectDB();
        const existing = await pool.request().query(`SELECT TOP 1 Id, ProviderName, ApiKey, Environment FROM InvoiceProviderSettings ORDER BY Id ASC`);
        const existingRow = existing.recordset[0];

        const providerName = ProviderName !== undefined ? (ProviderName?.trim() || null) : (existingRow?.ProviderName ?? null);
        const apiKey = ApiKey !== undefined ? (ApiKey?.trim() || null) : (existingRow?.ApiKey ?? null);
        const environment = Environment !== undefined ? Environment : (existingRow?.Environment ?? 'sandbox');

        let result;
        if (!existingRow) {
            result = await pool.request()
                .input('ProviderName', sql.NVarChar(50), providerName)
                .input('ApiKey', sql.NVarChar(300), apiKey)
                .input('Environment', sql.NVarChar(20), environment)
                .query(`
                    INSERT INTO InvoiceProviderSettings (ProviderName, ApiKey, Environment)
                    OUTPUT INSERTED.ProviderName, INSERTED.ApiKey, INSERTED.Environment
                    VALUES (@ProviderName, @ApiKey, @Environment)
                `);
        } else {
            result = await pool.request()
                .input('Id', sql.Int, existingRow.Id)
                .input('ProviderName', sql.NVarChar(50), providerName)
                .input('ApiKey', sql.NVarChar(300), apiKey)
                .input('Environment', sql.NVarChar(20), environment)
                .query(`
                    UPDATE InvoiceProviderSettings
                    SET ProviderName = @ProviderName, ApiKey = @ApiKey, Environment = @Environment, UpdatedAt = GETDATE()
                    OUTPUT INSERTED.ProviderName, INSERTED.ApiKey, INSERTED.Environment
                    WHERE Id = @Id
                `);
        }

        // API key'in KENDİSİ asla loglanmaz — sadece kim, hangi alanları değiştirdi bilgisi.
        logAudit(pool, {
            userId: req.user?.userId, action: 'INVOICE_PROVIDER_SETTINGS_UPDATE', entityType: 'InvoiceProviderSettings',
            details: {
                providerNameChanged: ProviderName !== undefined,
                apiKeyChanged: ApiKey !== undefined,
                environmentChanged: Environment !== undefined,
            },
        });

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('e-Fatura sağlayıcı ayarları güncellenirken hata:', err);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
}

module.exports = { getInvoiceProviderSettings, updateInvoiceProviderSettings };
