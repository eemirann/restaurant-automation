-- ============================================================
-- SEKMELİ AYARLAR SAYFASI İÇİN YENİ ALANLAR
--
-- Vergi & Fatura sekmesi (gerçek e-Arşiv entegratörüne bağlanınca
-- fatura XML'inde satıcı bilgisi olarak kullanılacak — bunlar gizli
-- DEĞİL (vergi no zaten fişte basılı olur), bu yüzden AppSettings'te
-- ve mevcut kimlik doğrulamasız GET /api/settings'te kalabilir.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'TaxNumber')
BEGIN
    ALTER TABLE AppSettings ADD TaxNumber NVARCHAR(20) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'TaxOffice')
BEGIN
    ALTER TABLE AppSettings ADD TaxOffice NVARCHAR(100) NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'BillingAddress')
BEGIN
    ALTER TABLE AppSettings ADD BillingAddress NVARCHAR(300) NULL;
END

-- Donanım (yazıcı) sekmesi — utils/print.js ve Tables.jsx'teki otomatik
-- mutfak fişi yazdırmayı buradan kontrol edilebilir hale getiriyor.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'KitchenAutoPrintEnabled')
BEGIN
    ALTER TABLE AppSettings ADD KitchenAutoPrintEnabled BIT NOT NULL
        CONSTRAINT DF_AppSettings_KitchenAutoPrintEnabled DEFAULT 1;
END
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'PrinterPaperWidth')
BEGIN
    ALTER TABLE AppSettings ADD PrinterPaperWidth INT NOT NULL
        CONSTRAINT DF_AppSettings_PrinterPaperWidth DEFAULT 80;
END

-- ============================================================
-- e-FATURA SAĞLAYICI KİMLİK BİLGİLERİ — AYRI TABLO, SADECE ADMIN
--
-- BİLEREK AppSettings'e eklenmedi: GET /api/settings kimlik doğrulamasız
-- (müşteri QR menüsü de okuyor) — bir API anahtarını oraya koymak onu
-- herkese açık hale getirir. Bu yüzden ayrı, sadece Admin'in
-- görebildiği/değiştirebildiği bir tabloda tutuluyor (bkz.
-- controllers/invoiceProviderSettingsController.js).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InvoiceProviderSettings')
BEGIN
    CREATE TABLE InvoiceProviderSettings (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ProviderName NVARCHAR(50) NULL,
        ApiKey NVARCHAR(300) NULL,
        Environment NVARCHAR(20) NOT NULL DEFAULT 'sandbox', -- sandbox | production
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
END
