-- ============================================================
-- STOK GRAFİĞİ AÇ/KAPA AYARI
--
-- Stok sayfasındaki çubuk grafiğin (büyük grafik paneli + her ürün
-- satırındaki küçük çubuk) gösterilip gösterilmeyeceğini kontrol eder.
-- Kapatılırsa (0) Stock.jsx sadece tabloyu gösterir, grafik hiç render
-- edilmez.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'StockChartEnabled')
BEGIN
    ALTER TABLE AppSettings ADD StockChartEnabled BIT NOT NULL
        CONSTRAINT DF_AppSettings_StockChartEnabled DEFAULT 1;
END
