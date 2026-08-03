-- ============================================================
-- MÜŞTERİ MENÜSÜ GENEL ADRESİ (masa QR kodlarında kullanılır)
--
-- Masa QR kodları bugüne kadar panelin BUILD anında gömülen
-- VITE_CUSTOMER_MENU_URL değerinden üretiliyordu. Bu, her restoranın
-- kendi adresini (yerel IP ya da Cloudflare Tunnel alan adı) kullanabilmesi
-- için panelin YENİDEN DERLENMESİNİ gerektiriyordu — offline/USB kurulumda
-- imajlar önceden derlenip geldiği için bu imkansızdı.
--
-- Bu yüzden adres artık veritabanında tutuluyor ve panelde Ayarlar
-- sayfasından değiştirilebiliyor. Boş bırakılırsa panel eski davranışa
-- (VITE_CUSTOMER_MENU_URL) düşer.
--
-- GİZLİ BİR DEĞER DEĞİLDİR: müşteri zaten bu adresi tarayıcısında görür,
-- bu yüzden kimlik doğrulamasız GET /api/settings içinde dönmesi sorun
-- değil (bkz. controllers/settingsController.js'deki TEXT_FIELDS notu).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'CustomerMenuBaseUrl')
BEGIN
    ALTER TABLE AppSettings ADD CustomerMenuBaseUrl NVARCHAR(300) NULL;
END
