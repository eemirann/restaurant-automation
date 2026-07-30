const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { sql, connectDB } = require('../config/db');

// docker-compose.yml: aynı named volume (db-backups) iki farklı serviste iki
// farklı mount noktasına bağlanır — SQL Server BACKUP DATABASE T-SQL'i
// BACKUP_DISK_DIR'e yazar, bu Node süreci ise AYNI fiziksel veriye
// BACKUP_FS_DIR üzerinden (fs.readdir/unlink) erişir.
const BACKUP_DISK_DIR = '/var/opt/mssql/backup'; // SQL Server konteynerindeki path (T-SQL DISK = ...)
const BACKUP_FS_DIR = process.env.BACKUP_FS_DIR || '/app/db-backups'; // backend konteynerindeki aynı volume

function backupFileName(date = new Date()) {
    return `RestoranDB_${date.toISOString().slice(0, 10)}.bak`;
}

// ============================================================
// Anlık yedek alır: BACKUP DATABASE çalıştırır, BackupHistory'ye kayıt
// ekler, ardından retention süresinden eski dosyaları siler.
// backup-now endpoint'i ve gece zamanlayıcısı bu fonksiyonu paylaşır.
// ============================================================
async function runBackup() {
    const pool = await connectDB();
    const fileName = backupFileName();
    const diskPath = `${BACKUP_DISK_DIR}/${fileName}`;

    await pool.request().query(`BACKUP DATABASE RestoranDB TO DISK = N'${diskPath}'`);

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
