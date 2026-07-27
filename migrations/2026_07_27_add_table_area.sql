-- ============================================================
-- Masalara "Area" (bölge/alan) kolonu ekler: Salon, Terrace, Garden, VIP, Bar.
-- Mevcut masalar varsayılan olarak 'Salon' alır.
-- DEFAULT ve CHECK, kolon eklemeyle AYNI ADD cümlesinde tanımlanır
-- (ayrı ALTER ile CHECK eklemek tek batch'te "Invalid column name" verir).
-- Idempotent: kolon zaten varsa dokunmaz.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Tables') AND name = 'Area')
BEGIN
    ALTER TABLE Tables ADD Area NVARCHAR(20) NOT NULL
        CONSTRAINT DF_Tables_Area DEFAULT 'Salon'
        CONSTRAINT CK_Tables_Area CHECK (Area IN ('Salon', 'Terrace', 'Garden', 'VIP', 'Bar'));
END
