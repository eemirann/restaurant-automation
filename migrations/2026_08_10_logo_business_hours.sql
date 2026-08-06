-- ============================================================
-- LOGO + AÇILIŞ/KAPANIŞ SAATİ
--
-- LogoUrl: yüklenen logo görselinin yolu (ör. /uploads/logo/logo-....png).
-- NULL ise sidebar/giriş ekranı/QR menü/fişler harf rumuzu (RestaurantName'in
-- ilk harfi) ile METİN modunda kalmaya devam eder — mevcut davranış BOZULMAZ.
--
-- OpeningTime/ClosingTime: "HH:MM" (24 saat) biçiminde metin olarak tutulur
-- (TIME değil — saat dilimi/format karmaşasından kaçınmak için basit metin
-- yeterli, controllers/settingsController.js regex ile doğrular). İKİSİ DE
-- NULL ise "çalışma saati kısıtı yok" anlamına gelir — restoran her zaman
-- açık kabul edilir (varsayılan, mevcut davranış). Gece yarısını geçen
-- aralıklar (ör. 18:00-02:00) desteklenir; bkz. utils/businessHours.js.
--
-- Idempotent: sütunlar zaten varsa hiçbir şey yapılmaz.
-- NOT: GO KULLANILMAZ — scripts/migrate.js dosyayı tek toplu iş olarak
-- gönderir ve GO ayırıcısını çözmez.
-- ============================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('AppSettings') AND name = 'LogoUrl'
)
BEGIN
    ALTER TABLE AppSettings ADD LogoUrl NVARCHAR(255) NULL;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('AppSettings') AND name = 'OpeningTime'
)
BEGIN
    ALTER TABLE AppSettings ADD OpeningTime NVARCHAR(5) NULL;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('AppSettings') AND name = 'ClosingTime'
)
BEGIN
    ALTER TABLE AppSettings ADD ClosingTime NVARCHAR(5) NULL;
END
