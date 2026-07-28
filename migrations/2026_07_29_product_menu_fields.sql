-- ============================================================
-- POS ürün ızgarası yeniden tasarımı için ürün alanları:
--   IsPopular  -> "Popüler" rozeti (admin tarafından işaretlenir)
--   Barcode    -> barkod ile arama (opsiyonel, benzersiz olmak zorunda değil)
--   StockCount -> ürün bazlı satılabilir stok adedi (opsiyonel; NULL = takip
--                 edilmiyor/sınırsız, mevcut IsAvailable "86" anahtarını
--                 değiştirmez, sadece ek bilgi/uyarı amaçlıdır)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'IsPopular')
BEGIN
    ALTER TABLE Products ADD IsPopular BIT NOT NULL
        CONSTRAINT DF_Products_IsPopular DEFAULT 0;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'Barcode')
BEGIN
    ALTER TABLE Products ADD Barcode NVARCHAR(64) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'StockCount')
BEGIN
    ALTER TABLE Products ADD StockCount INT NULL;
END
