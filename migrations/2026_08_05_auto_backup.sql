-- ============================================================
-- OTOMATİK YEDEKLEME
--
-- AppSettings.AutoBackupEnabled: açıkken utils/backupScheduler.js her gece
-- 03:00'te BACKUP DATABASE çalıştırır (EArsivVatRate'in ALTER TABLE
-- deseniyle aynı — tek satırlık AppSettings tablosuna eklenir).
-- AppSettings.AutoBackupRetentionDays: bu günden eski .bak dosyaları
-- (BackupHistory + diskteki dosya) otomatik silinir.
--
-- BackupHistory: her yedekleme denemesinin kaydı (manuel "Şimdi Yedekle"
-- dahil) — Settings sayfasında son yedekler listesi için okunur.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'AutoBackupEnabled')
BEGIN
    ALTER TABLE AppSettings ADD AutoBackupEnabled BIT NOT NULL
        CONSTRAINT DF_AppSettings_AutoBackupEnabled DEFAULT 0;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'AutoBackupRetentionDays')
BEGIN
    ALTER TABLE AppSettings ADD AutoBackupRetentionDays INT NOT NULL
        CONSTRAINT DF_AppSettings_AutoBackupRetentionDays DEFAULT 7;
END

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'BackupHistory')
BEGIN
    CREATE TABLE BackupHistory (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        FileName NVARCHAR(200) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        SizeBytes BIGINT NULL
    );

    CREATE INDEX IX_BackupHistory_CreatedAt ON BackupHistory(CreatedAt);
END
