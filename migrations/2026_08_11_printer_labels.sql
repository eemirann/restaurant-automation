-- ============================================================
-- YAZICI ETİKETLERİ — hangi fiş hangi fiziksel yazıcıya basılmalı.
--
-- ÖNEMLİ SINIR: window.print() (tarayıcı/Tauri WebView, ikisi de aynı
-- kısıtla) programatik olarak bir yazıcı SEÇEMEZ — bu, tüm tarayıcılarda
-- bilinçli bir güvenlik kısıtıdır, JS'ten baskı diyaloğunu atlayıp belirli
-- bir yazıcıya sessizce basmanın standart bir yolu yoktur. Gerçek ağ/USB
-- yazıcı entegrasyonu (ESC/POS, silent print) bu migration'ın KAPSAMI
-- DIŞINDADIR — ayrı bir iştir.
--
-- Bu iki alan sadece bir ETİKET/HATIRLATMADIR: personel fiş bastığında
-- açılan OS yazdırma diyaloğunda HANGİ fiziksel yazıcıyı seçmesi
-- gerektiğini görsün diye (bkz. utils/print.js, Tables.jsx, PaymentDrawer.jsx).
-- Seçimi hâlâ personel kendisi OS diyaloğunda yapar.
--
-- İkisi de NULL bırakılabilir (varsayılan) — o zaman hiçbir hatırlatma
-- gösterilmez, mevcut davranış AYNEN korunur.
--
-- Idempotent: sütunlar zaten varsa hiçbir şey yapılmaz.
-- NOT: GO KULLANILMAZ — scripts/migrate.js dosyayı tek toplu iş olarak
-- gönderir ve GO ayırıcısını çözmez.
-- ============================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('AppSettings') AND name = 'KitchenPrinterName'
)
BEGIN
    ALTER TABLE AppSettings ADD KitchenPrinterName NVARCHAR(100) NULL;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('AppSettings') AND name = 'CustomerPrinterName'
)
BEGIN
    ALTER TABLE AppSettings ADD CustomerPrinterName NVARCHAR(100) NULL;
END
