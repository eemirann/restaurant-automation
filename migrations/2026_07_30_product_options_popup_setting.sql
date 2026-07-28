-- ============================================================
-- ÜRÜN SEÇENEKLERİ POP-UP'I AÇ/KAPA AYARI
--
-- Sipariş ekranında ürüne tıklandığında ekstra/şurup seçim pop-up'ının
-- (ProductDetailModal) açılıp açılmayacağını kontrol eder. Kapatılırsa
-- (0), ürün her zaman doğrudan sepete eklenir; ekstra/şurup bağlı olan
-- ürünlerde bile pop-up hiç açılmaz (bkz. Tables.jsx: TableOrderCart).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'ProductOptionsPopupEnabled')
BEGIN
    ALTER TABLE AppSettings ADD ProductOptionsPopupEnabled BIT NOT NULL
        CONSTRAINT DF_AppSettings_ProductOptionsPopupEnabled DEFAULT 1;
END
