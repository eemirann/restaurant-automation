-- ============================================================
-- "86 / Tükendi": ürünü silmeden (IsActive) geçici olarak satışa
-- kapatmak için. IsAvailable=0 ürün menüde görünür ama siparişe eklenemez.
-- DEFAULT kolon eklemeyle aynı ADD cümlesinde tanımlanır.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'IsAvailable')
BEGIN
    ALTER TABLE Products ADD IsAvailable BIT NOT NULL
        CONSTRAINT DF_Products_IsAvailable DEFAULT 1;
END
