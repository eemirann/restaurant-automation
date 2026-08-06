-- ============================================================
-- ÇOKLU ŞUBE DESTEĞİ — TEMEL ALTYAPI
--
-- Bu, çoklu şube desteğinin sadece TEMELİDİR: Branches tablosu +
-- Users/Tables'a BranchId + tableController'da filtre. Products/Stock/
-- Orders/Payments/Reports/Dashboard gibi diğer controller'lara şube
-- filtrelemesinin yayılması BİLİNÇLİ olarak bu turun kapsamı dışıdır
-- (bkz. FIKIR_NOTLARI.md — "Çoklu Şube Desteği" maddesi).
--
-- Mevcut (tek şubeli) kurulumlar kesintiye uğramaz: bir "Ana Şube"
-- otomatik oluşturulur, tüm mevcut kullanıcı/masa kayıtları ona atanır.
-- BranchId NULLABLE bırakılır — Admin için NULL "tüm şubeleri gör"
-- anlamına gelir (bkz. controllers/tableController.js).
-- ============================================================

-- ---------- Branches ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Branches')
BEGIN
    CREATE TABLE Branches (
        BranchId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(150) NOT NULL,
        Address NVARCHAR(300) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
END

IF NOT EXISTS (SELECT 1 FROM Branches)
BEGIN
    INSERT INTO Branches (Name) VALUES (N'Ana Şube');
END

-- ---------- Users.BranchId ----------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'BranchId')
BEGIN
    ALTER TABLE Users ADD BranchId INT NULL
        CONSTRAINT FK_Users_Branch FOREIGN KEY REFERENCES Branches(BranchId);

    -- Aynı batch içinde yeni eklenen kolona referans derleme zamanında
    -- "Invalid column name" hatası verir — EXEC ile çalışma zamanına ertelenir
    -- (bkz. 2026_07_31_qr_customer_menu.sql'deki aynı desen).
    EXEC('UPDATE Users SET BranchId = (SELECT TOP 1 BranchId FROM Branches ORDER BY BranchId) WHERE BranchId IS NULL');
END

-- ---------- Tables.BranchId ----------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Tables') AND name = 'BranchId')
BEGIN
    ALTER TABLE Tables ADD BranchId INT NULL
        CONSTRAINT FK_Tables_Branch FOREIGN KEY REFERENCES Branches(BranchId);

    EXEC('UPDATE Tables SET BranchId = (SELECT TOP 1 BranchId FROM Branches ORDER BY BranchId) WHERE BranchId IS NULL');
END
