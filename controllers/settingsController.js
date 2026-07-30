const { sql, connectDB } = require('../config/db');
const { runBackup } = require('../utils/backupScheduler');

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

// Opsiyonel metin alanları — hepsi null'lanabilir, tek tip doğrulama
// (maks. uzunluk) yeterli. NOT: Bu tablo GET /api/settings ile (kimlik
// doğrulamasız — musteri-menu de okuyor) HERKESE AÇIKTIR. Bu yüzden
// buraya asla API anahtarı/şifre gibi gizli bir alan eklenmez — e-Fatura
// sağlayıcı kimlik bilgileri bilerek ayrı, sadece Admin'in erişebildiği
// InvoiceProviderSettings tablosunda tutuluyor (bkz.
// controllers/invoiceProviderSettingsController.js).
const TEXT_FIELDS = [
    { key: 'CafeNote', maxLen: 300 },
    { key: 'SocialInstagram', maxLen: 200 },
    { key: 'SocialFacebook', maxLen: 200 },
    { key: 'SocialX', maxLen: 200 },
    { key: 'SocialWhatsapp', maxLen: 30 },
    { key: 'ContactPhone', maxLen: 30 },
    { key: 'ContactAddress', maxLen: 300 },
    { key: 'TaxNumber', maxLen: 20 },
    { key: 'TaxOffice', maxLen: 100 },
    { key: 'BillingAddress', maxLen: 300 },
];

const BOOL_FIELDS = ['ProductOptionsPopupEnabled', 'StockChartEnabled', 'KitchenAutoPrintEnabled', 'AutoBackupEnabled'];

const ALL_COLUMNS = ['RestaurantName', 'ThemeColor', ...BOOL_FIELDS, 'EArsivVatRate', 'PrinterPaperWidth', 'LoyaltyPointsRate', 'AutoBackupRetentionDays', ...TEXT_FIELDS.map((f) => f.key)];

// ============================================================
// GENEL AYARLAR — tek satırlık AppSettings tablosu, tüm kullanıcılar
// için ortak. GET kimlik doğrulamasız (bkz. routes/settings.js): hem
// panelin login ekranı hem de musteri-menu'nün sol bilgi paneli/kapalı
// banner'ı bunu doğrudan okur.
// ============================================================

async function getSettings(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`SELECT ${ALL_COLUMNS.join(', ')} FROM AppSettings ORDER BY AppSettingsId ASC`);

        if (result.recordset.length === 0) {
            return res.status(200).json({
                RestaurantName: 'Restoran', ThemeColor: '#FF4713', ProductOptionsPopupEnabled: true,
                StockChartEnabled: true, KitchenAutoPrintEnabled: true, EArsivVatRate: 10, PrinterPaperWidth: 80,
                LoyaltyPointsRate: 10, AutoBackupEnabled: false, AutoBackupRetentionDays: 7,
                ...Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, null])),
            });
        }

        const row = result.recordset[0];
        res.status(200).json({
            ...row,
            ...Object.fromEntries(BOOL_FIELDS.map((k) => [k, Boolean(row[k])])),
            EArsivVatRate: Number(row.EArsivVatRate),
            PrinterPaperWidth: Number(row.PrinterPaperWidth),
            LoyaltyPointsRate: Number(row.LoyaltyPointsRate),
            AutoBackupRetentionDays: Number(row.AutoBackupRetentionDays),
        });
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
        const { RestaurantName, ThemeColor, EArsivVatRate, PrinterPaperWidth, LoyaltyPointsRate, AutoBackupRetentionDays } = req.body;

        if (!RestaurantName || typeof RestaurantName !== 'string' || !RestaurantName.trim()) {
            return res.status(400).json({ error: 'Restoran adı zorunludur' });
        }
        if (RestaurantName.trim().length > 100) {
            return res.status(400).json({ error: 'Restoran adı en fazla 100 karakter olabilir' });
        }
        if (!ThemeColor || typeof ThemeColor !== 'string' || !HEX_COLOR_REGEX.test(ThemeColor)) {
            return res.status(400).json({ error: 'Tema rengi #RRGGBB formatında olmalıdır' });
        }
        for (const key of BOOL_FIELDS) {
            if (req.body[key] !== undefined && typeof req.body[key] !== 'boolean') {
                return res.status(400).json({ error: `${key} boolean olmalıdır` });
            }
        }
        if (EArsivVatRate !== undefined && (typeof EArsivVatRate !== 'number' || EArsivVatRate < 0 || EArsivVatRate > 100)) {
            return res.status(400).json({ error: 'EArsivVatRate 0-100 arasında bir sayı olmalıdır' });
        }
        if (PrinterPaperWidth !== undefined && ![58, 80].includes(PrinterPaperWidth)) {
            return res.status(400).json({ error: 'PrinterPaperWidth 58 veya 80 olmalıdır' });
        }
        if (LoyaltyPointsRate !== undefined && (typeof LoyaltyPointsRate !== 'number' || LoyaltyPointsRate < 0 || LoyaltyPointsRate > 100)) {
            return res.status(400).json({ error: 'LoyaltyPointsRate 0-100 arasında bir sayı olmalıdır' });
        }
        if (AutoBackupRetentionDays !== undefined && (typeof AutoBackupRetentionDays !== 'number' || AutoBackupRetentionDays < 1 || AutoBackupRetentionDays > 365)) {
            return res.status(400).json({ error: 'AutoBackupRetentionDays 1-365 arasında bir sayı olmalıdır' });
        }
        for (const f of TEXT_FIELDS) {
            const v = req.body[f.key];
            if (v !== undefined && v !== null && (typeof v !== 'string' || v.length > f.maxLen)) {
                return res.status(400).json({ error: `${f.key} en fazla ${f.maxLen} karakter olabilen bir metin olmalıdır` });
            }
        }

        const pool = await connectDB();

        const existing = await pool.request().query(`SELECT AppSettingsId, ${ALL_COLUMNS.join(', ')} FROM AppSettings ORDER BY AppSettingsId ASC`);
        const existingRow = existing.recordset[0];

        const request = pool.request()
            .input('RestaurantName', sql.NVarChar(100), RestaurantName.trim())
            .input('ThemeColor', sql.Char(7), ThemeColor.toUpperCase())
            .input('EArsivVatRate', sql.Decimal(5, 2), EArsivVatRate !== undefined ? EArsivVatRate : (existingRow ? Number(existingRow.EArsivVatRate) : 10))
            .input('PrinterPaperWidth', sql.Int, PrinterPaperWidth !== undefined ? PrinterPaperWidth : (existingRow ? Number(existingRow.PrinterPaperWidth) : 80))
            .input('LoyaltyPointsRate', sql.Decimal(5, 2), LoyaltyPointsRate !== undefined ? LoyaltyPointsRate : (existingRow ? Number(existingRow.LoyaltyPointsRate) : 10))
            .input('AutoBackupRetentionDays', sql.Int, AutoBackupRetentionDays !== undefined ? AutoBackupRetentionDays : (existingRow ? Number(existingRow.AutoBackupRetentionDays) : 7));

        for (const key of BOOL_FIELDS) {
            const value = req.body[key] !== undefined ? req.body[key] : (existingRow ? Boolean(existingRow[key]) : true);
            request.input(key, sql.Bit, value);
        }

        for (const f of TEXT_FIELDS) {
            const raw = req.body[f.key];
            const value = raw !== undefined ? (raw === null ? null : raw.trim() || null) : (existingRow ? existingRow[f.key] : null);
            request.input(f.key, sql.NVarChar(f.maxLen), value);
        }

        const dynamicColumns = [...BOOL_FIELDS, ...TEXT_FIELDS.map((f) => f.key)];
        const setClause = dynamicColumns.map((k) => `${k} = @${k}`).join(', ');
        const outputList = ['RestaurantName', 'ThemeColor', 'EArsivVatRate', 'PrinterPaperWidth', 'LoyaltyPointsRate', 'AutoBackupRetentionDays', ...dynamicColumns]
            .map((k) => `INSERTED.${k}`).join(', ');

        let result;
        if (!existingRow) {
            const insertColumns = ['RestaurantName', 'ThemeColor', 'EArsivVatRate', 'PrinterPaperWidth', 'LoyaltyPointsRate', 'AutoBackupRetentionDays', ...dynamicColumns];
            const insertParams = insertColumns.map((k) => `@${k}`).join(', ');
            result = await request.query(`
                INSERT INTO AppSettings (${insertColumns.join(', ')})
                OUTPUT ${outputList}
                VALUES (${insertParams})
            `);
        } else {
            result = await request
                .input('Id', sql.Int, existingRow.AppSettingsId)
                .query(`
                    UPDATE AppSettings
                    SET RestaurantName = @RestaurantName, ThemeColor = @ThemeColor,
                        EArsivVatRate = @EArsivVatRate, PrinterPaperWidth = @PrinterPaperWidth,
                        LoyaltyPointsRate = @LoyaltyPointsRate, AutoBackupRetentionDays = @AutoBackupRetentionDays,
                        ${setClause}, UpdatedAt = GETDATE()
                    OUTPUT ${outputList}
                    WHERE AppSettingsId = @Id
                `);
        }

        const row = result.recordset[0];
        res.status(200).json({
            ...row,
            ...Object.fromEntries(BOOL_FIELDS.map((k) => [k, Boolean(row[k])])),
            EArsivVatRate: Number(row.EArsivVatRate),
            PrinterPaperWidth: Number(row.PrinterPaperWidth),
            LoyaltyPointsRate: Number(row.LoyaltyPointsRate),
            AutoBackupRetentionDays: Number(row.AutoBackupRetentionDays),
        });
    } catch (err) {
        console.error('Ayarlar güncellenirken hata:', err);
        res.status(500).json({ error: 'Ayarlar güncellenemedi' });
    }
}

// ============================================================
// ANLIK YEDEK (SADECE ADMIN) — utils/backupScheduler.js'deki AYNI
// runBackup() fonksiyonunu senkron çağırır (gece zamanlayıcısıyla ortak).
// ============================================================
async function backupNow(req, res) {
    try {
        const result = await runBackup();
        res.status(200).json(result);
    } catch (err) {
        console.error('Anlık yedekleme başarısız:', err);
        res.status(500).json({ error: 'Yedekleme başarısız' });
    }
}

// Son N yedek kaydını listeler (SADECE ADMIN) — Settings sayfasındaki
// küçük yedek listesi için.
async function getBackups(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`SELECT TOP 20 Id, FileName, CreatedAt, SizeBytes FROM BackupHistory ORDER BY CreatedAt DESC`);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Yedek geçmişi getirilirken hata:', err);
        res.status(500).json({ error: 'Yedek geçmişi getirilemedi' });
    }
}

module.exports = { getSettings, updateSettings, backupNow, getBackups };
