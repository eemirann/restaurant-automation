const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { sql, connectDB } = require('../config/db');

// İKİ AYRI YOL, AYNI FİZİKSEL KLASÖR:
//   BACKUP_DISK_DIR -> SQL Server sürecinin gördüğü yol (T-SQL: BACKUP ... TO DISK)
//   BACKUP_FS_DIR   -> bu Node sürecinin gördüğü yol (fs.readdir/unlink)
//
// Docker'da bunlar FARKLIYDI: aynı named volume (db-backups) db ve backend
// konteynerlerinde iki farklı mount noktasına bağlanıyordu — varsayılanlar
// bu yüzden Linux konteyner yollarıdır ve compose kurulumu aynen çalışır.
//
// SQL Server Express + Windows Servisi kurulumunda ikisi de AYNI Windows
// klasörünü gösterir (ör. C:\RestoranOtomasyonu\db-backups) ve installer
// tarafından .env'e yazılır. O klasöre SQL Server servis hesabının
// (NT SERVICE\MSSQL$SQLEXPRESS) YAZMA izni verilmelidir — bunu
// installer/kurulum-sql-express.ps1 yapar.
const BACKUP_DISK_DIR = process.env.BACKUP_DISK_DIR || '/var/opt/mssql/backup';
const BACKUP_FS_DIR = process.env.BACKUP_FS_DIR || '/app/db-backups';

// Veritabanı adı .env'den (config/db.js'in bağlandığı AYNI veritabanı) —
// SABİT 'RestoranDB' YAZILMAZ. Kurulum sihirbazı veritabanını hep bu adla
// oluşturduğu için üretimde fark edilmiyordu, ama DB_DATABASE farklı bir ad
// taşıyan her ortamda (ör. geliştirme, çoklu-restoran test kurulumu) yedek
// alma "Database 'RestoranDB' does not exist" ile başarısız oluyordu — asıl
// bağlı olunan veritabanı hiç sorgulanmıyordu.
const DB_NAME = process.env.DB_DATABASE || 'RestoranDB';

// T-SQL tanımlayıcı kaçışı: köşeli parantez içine al, içindeki ']' varsa
// ikiye katla (QUOTENAME ile aynı kural). DB_DATABASE admin tarafından
// .env'e yazılır, kullanıcı girdisi değildir — yine de raw SQL'e gidiyor.
const DB_NAME_ESCAPED = `[${DB_NAME.replace(/]/g, ']]')}]`;

function backupFileName(date = new Date()) {
    return `${DB_NAME}_${date.toISOString().slice(0, 10)}.bak`;
}

// ============================================================
// Anlık yedek alır: BACKUP DATABASE çalıştırır, BackupHistory'ye kayıt
// ekler, ardından retention süresinden eski dosyaları siler.
// backup-now endpoint'i ve gece zamanlayıcısı bu fonksiyonu paylaşır.
// ============================================================
async function runBackup() {
    const pool = await connectDB();
    const fileName = backupFileName();
    // Ayırıcı hedefe göre seçilir: Windows yolu (C:\...) ise '\', Linux
    // konteyner yolu (/var/opt/mssql/backup) ise '/'.
    const ayirici = /^[A-Za-z]:\\/.test(BACKUP_DISK_DIR) ? '\\' : '/';
    const diskPath = `${BACKUP_DISK_DIR.replace(/[\\/]+$/, '')}${ayirici}${fileName}`;

    await pool.request().query(`BACKUP DATABASE ${DB_NAME_ESCAPED} TO DISK = N'${diskPath}'`);

    let sizeBytes = null;
    try {
        const stat = fs.statSync(path.join(BACKUP_FS_DIR, fileName));
        sizeBytes = stat.size;
    } catch {
        // Dosya boyutu okunamadıysa NULL bırakılır (backend ve db konteyneri
        // volume'u henüz senkron olmayabilir) — kritik değil.
    }

    await pool.request()
        .input('FileName', sql.NVarChar(200), fileName)
        .input('SizeBytes', sql.Int, sizeBytes)
        .query(`INSERT INTO BackupHistory (FileName, SizeBytes) OUTPUT INSERTED.* VALUES (@FileName, @SizeBytes)`);

    await cleanupOldBackups(pool);

    return { fileName, sizeBytes };
}

// AutoBackupRetentionDays'ten eski .bak dosyalarını diskten siler (BackupHistory
// kaydı geçmiş referans olarak kalır, silinmez).
async function cleanupOldBackups(pool) {
    const settingsResult = await pool.request().query(`SELECT TOP 1 AutoBackupRetentionDays FROM AppSettings ORDER BY AppSettingsId ASC`);
    const retentionDays = Number(settingsResult.recordset[0]?.AutoBackupRetentionDays) || 7;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    let files;
    try {
        files = fs.readdirSync(BACKUP_FS_DIR);
    } catch {
        return; // volume henüz mount edilmemiş olabilir (ör. yerel geliştirme)
    }

    for (const file of files) {
        if (!file.endsWith('.bak')) continue;
        const filePath = path.join(BACKUP_FS_DIR, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
        }
    }
}

// Sadece AutoBackupEnabled=1 ise yedek alır — zamanlayıcı tetiklendiğinde çağrılır.
async function runScheduledBackupIfEnabled() {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`SELECT TOP 1 AutoBackupEnabled FROM AppSettings ORDER BY AppSettingsId ASC`);
        if (!result.recordset[0]?.AutoBackupEnabled) return;
        await runBackup();
    } catch (err) {
        console.error('Otomatik yedekleme başarısız:', err);
    }
}

// server.js'de bir kez çağrılır — her gece 03:00'te zamanlayıcıyı kurar.
function initBackupScheduler() {
    cron.schedule('0 3 * * *', runScheduledBackupIfEnabled);
}

module.exports = { initBackupScheduler, runBackup, runScheduledBackupIfEnabled, BACKUP_FS_DIR };
