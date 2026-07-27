-- ============================================================
-- Mutfak Ekranı (KDS) için sipariş kalemi bazında hazırlanma durumu.
-- Sipariş düzeyindeki Pending/Served akışına DOKUNMAZ; bu kolon
-- yalnızca mutfağın kalem kalem takibi içindir.
--   New       -> mutfağa yeni düştü
--   Preparing -> hazırlanıyor
--   Ready     -> hazır (servise verilebilir)
--   Served    -> servis edildi
--
-- NOT: DEFAULT ve CHECK kısıtları, kolon eklemeyle AYNI ADD cümlesinde
-- tanımlanır. Ayrı bir ALTER ile CHECK eklenirse, tek batch içinde yeni
-- kolon henüz "görünmediği" için "Invalid column name" hatası oluşur.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OrderDetails') AND name = 'PrepStatus')
BEGIN
    ALTER TABLE OrderDetails ADD PrepStatus NVARCHAR(20) NOT NULL
        CONSTRAINT DF_OrderDetails_PrepStatus DEFAULT 'New'
        CONSTRAINT CK_OrderDetails_PrepStatus CHECK (PrepStatus IN ('New', 'Preparing', 'Ready', 'Served'));
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OrderDetails') AND name = 'PreparedAt')
BEGIN
    ALTER TABLE OrderDetails ADD PreparedAt DATETIME NULL;
END
