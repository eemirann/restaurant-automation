-- ============================================================
-- GENEL GÖRÜNÜM AYARLARI (restoran adı + tema rengi)
-- Tek satırlık ayar tablosu — panelin sidebar başlığında görünen
-- restoran adı ve vurgu renginin (varsayılan turuncu "ember") tüm
-- kullanıcılar için ortak (global) olarak saklandığı yer.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AppSettings')
BEGIN
    CREATE TABLE AppSettings (
        AppSettingsId INT IDENTITY(1,1) PRIMARY KEY,
        RestaurantName NVARCHAR(100) NOT NULL DEFAULT 'Restoran',
        ThemeColor CHAR(7) NOT NULL DEFAULT '#FF4713',
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );

    INSERT INTO AppSettings (RestaurantName, ThemeColor) VALUES ('Restoran', '#FF4713');
END
