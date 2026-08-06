const fs = require('fs');
const path = require('path');
const { sql, connectDB } = require('../config/db');
const { runBackup } = require('../utils/backupScheduler');
const { logAudit } = require('../utils/audit');
const { LOGO_DIR } = require('../utils/paths');

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
// "HH:MM", 24 saat — bkz. utils/businessHours.js.
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

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
    // Masa QR kodlarının işaret ettiği müşteri menüsü adresi (ör.
    // http://192.168.1.50:4091). Menüyü backend'in kendisi servis ettiği
    // için port, sunucunun portudur — ayrı bir menü servisi yoktur
    // (bkz. server.js). Gizli değildir — müşteri zaten tarayıcısında görür.
    { key: 'CustomerMenuBaseUrl', maxLen: 300 },
    // Fiş yazıcı ETİKETLERİ — programatik yazıcı seçimi DEĞİLDİR (window.print
    // bunu desteklemiyor, tüm tarayıcılarda güvenlik kısıtı). Sadece personelin
    // OS yazdırma diyaloğunda hangi fiziksel yazıcıyı seçmesi gerektiğini
    // hatırlatan bir isim/etikettir (bkz. utils/print.js, Tables.jsx,
    // PaymentDrawer.jsx). Gerçek ağ/USB entegrasyonu ayrı bir iştir.
    { key: 'KitchenPrinterName', maxLen: 100 },
    { key: 'CustomerPrinterName', maxLen: 100 },
];

const BOOL_FIELDS = ['ProductOptionsPopupEnabled', 'StockChartEnabled', 'KitchenAutoPrintEnabled', 'AutoBackupEnabled'];

// OpeningTime/ClosingTime: PUT ile yazılabilir ama TEXT_FIELDS'ın genel
// maxLen doğrulaması yetmiyor (HH:MM biçimi + "ikisi de dolu ya da ikisi de
// boş" kuralı gerekiyor) — bu yüzden EArsivVatRate gibi kendi doğrulamasıyla
// ayrı ele alınıyor (bkz. updateSettings).
//
// LogoUrl İSE BU LİSTEDE DEĞİL: PUT /api/settings ile YAZILAMAZ, sadece
// POST/DELETE /api/settings/logo değiştirebilir (ürün resimlerinin
// ProductController'daki createProduct/updateProduct'tan değil, ayrı bir
// /image ucundan yönetilmesiyle AYNI desen). Yine de GET yanıtında dönmesi
// ve PUT'un (değiştirmediği halde) yanıtından KAYBOLMAMASI için ALL_COLUMNS'a
// dahil edilir.
const ALL_COLUMNS = [
    'RestaurantName', 'ThemeColor', ...BOOL_FIELDS,
    'EArsivVatRate', 'PrinterPaperWidth', 'LoyaltyPointsRate', 'AutoBackupRetentionDays',
    'OpeningTime', 'ClosingTime', 'LogoUrl',
    ...TEXT_FIELDS.map((f) => f.key),
];

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
                OpeningTime: null, ClosingTime: null, LogoUrl: null,
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
        const { RestaurantName, ThemeColor, EArsivVatRate, PrinterPaperWidth, LoyaltyPointsRate, AutoBackupRetentionDays, OpeningTime, ClosingTime } = req.body;

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
        if (OpeningTime !== undefined && OpeningTime !== null && (typeof OpeningTime !== 'string' || !TIME_REGEX.test(OpeningTime))) {
            return res.status(400).json({ error: 'OpeningTime "SS:DD" biçiminde olmalıdır (ör. 09:00)' });
        }
        if (ClosingTime !== undefined && ClosingTime !== null && (typeof ClosingTime !== 'string' || !TIME_REGEX.test(ClosingTime))) {
            return res.status(400).json({ error: 'ClosingTime "SS:DD" biçiminde olmalıdır (ör. 23:00)' });
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

        // İKİSİ DE dolu ya da İKİSİ DE boş olmalı — sadece biri girilirse
        // utils/businessHours.js "kısıt yok" (her zaman açık) sayar ve bu,
        // kullanıcının niyetiyle sessizce çelişebilir (ör. sadece kapanış
        // saati girip açılışın boş kalması "hiç kapanmaz" anlamına gelirdi).
        const resolvedOpeningTime = OpeningTime !== undefined ? OpeningTime : (existingRow ? existingRow.OpeningTime : null);
        const resolvedClosingTime = ClosingTime !== undefined ? ClosingTime : (existingRow ? existingRow.ClosingTime : null);
        if (Boolean(resolvedOpeningTime) !== Boolean(resolvedClosingTime)) {
            return res.status(400).json({ error: 'Açılış ve kapanış saatinin ikisi de girilmeli ya da ikisi de boş bırakılmalıdır' });
        }

        const request = pool.request()
            .input('RestaurantName', sql.NVarChar(100), RestaurantName.trim())
            .input('ThemeColor', sql.Char(7), ThemeColor.toUpperCase())
            .input('EArsivVatRate', sql.Decimal(5, 2), EArsivVatRate !== undefined ? EArsivVatRate : (existingRow ? Number(existingRow.EArsivVatRate) : 10))
            .input('PrinterPaperWidth', sql.Int, PrinterPaperWidth !== undefined ? PrinterPaperWidth : (existingRow ? Number(existingRow.PrinterPaperWidth) : 80))
            .input('LoyaltyPointsRate', sql.Decimal(5, 2), LoyaltyPointsRate !== undefined ? LoyaltyPointsRate : (existingRow ? Number(existingRow.LoyaltyPointsRate) : 10))
            .input('AutoBackupRetentionDays', sql.Int, AutoBackupRetentionDays !== undefined ? AutoBackupRetentionDays : (existingRow ? Number(existingRow.AutoBackupRetentionDays) : 7))
            .input('OpeningTime', sql.NVarChar(5), resolvedOpeningTime || null)
            .input('ClosingTime', sql.NVarChar(5), resolvedClosingTime || null);

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
        // NAMED_COLUMNS: yazılabilir ama özel doğrulaması olan alanlar.
        const NAMED_COLUMNS = ['RestaurantName', 'ThemeColor', 'EArsivVatRate', 'PrinterPaperWidth', 'LoyaltyPointsRate', 'AutoBackupRetentionDays', 'OpeningTime', 'ClosingTime'];
        // outputList'e LogoUrl de eklenir ama insertColumns/setClause'a EKLENMEZ:
        // bu uç LogoUrl'i hiç YAZMAZ (sadece POST/DELETE /api/settings/logo
        // yazar), OUTPUT INSERTED.LogoUrl sadece satırın GÜNCEL değerini okur.
        // Bu olmasaydı PUT yanıtı LogoUrl'i içermez, panel context'i
        // updateLocalSettings ile TÜM state'i bu yanıtla değiştirdiği için
        // (bkz. SettingsContext.jsx) logo o an ekrandan KAYBOLURDU.
        const outputList = [...NAMED_COLUMNS, 'LogoUrl', ...dynamicColumns]
            .map((k) => `INSERTED.${k}`).join(', ');

        let result;
        if (!existingRow) {
            const insertColumns = [...NAMED_COLUMNS, ...dynamicColumns];
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
                        OpeningTime = @OpeningTime, ClosingTime = @ClosingTime,
                        ${setClause}, UpdatedAt = GETDATE()
                    OUTPUT ${outputList}
                    WHERE AppSettingsId = @Id
                `);
        }

        // Ne değişti — sadece alan ADLARI loglanır, değerleri Audit'e taşımaya gerek yok.
        const changedFields = existingRow
            ? ALL_COLUMNS.filter((k) => req.body[k] !== undefined && String(req.body[k]) !== String(existingRow[k]))
            : Object.keys(req.body).filter((k) => ALL_COLUMNS.includes(k));
        if (changedFields.length > 0) {
            logAudit(pool, {
                userId: req.user?.userId, action: 'SETTINGS_UPDATE', entityType: 'AppSettings',
                entityId: existingRow?.AppSettingsId ?? null, details: { changedFields },
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

// AppSettings satırını döndürür (yoksa OLUŞTURUR) — uploadLogo/removeLogo
// UPDATE ile yetinemez çünkü ilk kurulumda henüz hiç satır olmayabilir
// (updateSettings zaten bu "satır yoksa INSERT" akışını yapıyor, ama Genel
// sekmesi hiç kaydedilmeden doğrudan logo yüklenirse burada da aynı akış
// gerekir — RestaurantName/ThemeColor NOT NULL olduğu için varsayılanlarla
// oluşturulur).
async function ensureSettingsRow(pool) {
    const existing = await pool.request().query(`SELECT AppSettingsId, LogoUrl FROM AppSettings ORDER BY AppSettingsId ASC`);
    if (existing.recordset.length > 0) return existing.recordset[0];

    const inserted = await pool.request()
        .input('RestaurantName', sql.NVarChar(100), 'Restoran')
        .input('ThemeColor', sql.Char(7), '#FF4713')
        .input('EArsivVatRate', sql.Decimal(5, 2), 10)
        .input('PrinterPaperWidth', sql.Int, 80)
        .input('LoyaltyPointsRate', sql.Decimal(5, 2), 10)
        .input('AutoBackupRetentionDays', sql.Int, 7)
        .query(`
            INSERT INTO AppSettings (RestaurantName, ThemeColor, EArsivVatRate, PrinterPaperWidth, LoyaltyPointsRate, AutoBackupRetentionDays)
            OUTPUT INSERTED.AppSettingsId, INSERTED.LogoUrl
            VALUES (@RestaurantName, @ThemeColor, @EArsivVatRate, @PrinterPaperWidth, @LoyaltyPointsRate, @AutoBackupRetentionDays)
        `);
    return inserted.recordset[0];
}

// ============================================================
// LOGO YÜKLE (SADECE ADMIN) — sidebar, giriş ekranı, QR menü üstü, fişler.
//
// Ürün resmi yüklemesiyle (uploadProductImage) AYNI desen: ayrı bir
// multipart uç, PUT /api/settings'in genel akışına dahil DEĞİL. Eski logo
// dosyası SİLİNMEZ (ürün resimleri de silinmiyor — kod tabanındaki mevcut
// davranış), sadece AppSettings.LogoUrl yeni dosyayı gösterecek şekilde
// güncellenir.
// ============================================================
async function uploadLogo(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: 'Logo dosyası gerekli' });
    }

    try {
        const pool = await connectDB();
        const row = await ensureSettingsRow(pool);
        const logoUrl = `/uploads/logo/${req.file.filename}`;

        await pool.request()
            .input('Id', sql.Int, row.AppSettingsId)
            .input('LogoUrl', sql.NVarChar(255), logoUrl)
            .query(`UPDATE AppSettings SET LogoUrl = @LogoUrl WHERE AppSettingsId = @Id`);

        res.status(200).json({ LogoUrl: logoUrl });
    } catch (err) {
        console.error('Logo yüklenirken hata:', err);
        res.status(500).json({ error: 'Logo yüklenemedi' });
    }
}

// ============================================================
// LOGO KALDIR (SADECE ADMIN) — sidebar/giriş ekranı/QR menü/fişler tekrar
// METİN moduna (RestaurantName'in ilk harfi) döner. Buradaki silme, upload
// sırasında ESKİ dosyanın korunmasıyla ÇELİŞMEZ: kullanıcı burada AÇIKÇA
// "kaldır" dediği için, artık hiçbir AppSettings satırının işaret etmediği
// dosyayı diskte tutmanın anlamı yok.
// ============================================================
async function removeLogo(req, res) {
    try {
        const pool = await connectDB();
        const row = await ensureSettingsRow(pool);

        if (row.LogoUrl) {
            const filePath = path.join(LOGO_DIR, path.basename(row.LogoUrl));
            fs.unlink(filePath, () => {
                // Dosya zaten yoksa/silinemiyorsa sessizce geç — kritik değil,
                // veritabanı kaydı zaten NULL'a çekiliyor.
            });
        }

        await pool.request()
            .input('Id', sql.Int, row.AppSettingsId)
            .query(`UPDATE AppSettings SET LogoUrl = NULL WHERE AppSettingsId = @Id`);

        res.status(200).json({ LogoUrl: null });
    } catch (err) {
        console.error('Logo kaldırılırken hata:', err);
        res.status(500).json({ error: 'Logo kaldırılamadı' });
    }
}

module.exports = { getSettings, updateSettings, backupNow, getBackups, uploadLogo, removeLogo };
