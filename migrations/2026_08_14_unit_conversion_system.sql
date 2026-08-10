-- ============================================================
-- BİRİM DÖNÜŞÜM SİSTEMİ (Unit of Measure)
--
-- Önceki tur: sadece şurup+ml için tek amaçlı bir alan (Products.ServingSize)
-- eklenmişti. Bu migration onu GENELLEŞTİRİR: herhangi bir ürün (hammadde,
-- şurup, ekstra) stokta TEK bir temel birimle tutulur (ml/g/adet...), reçete/
-- sipariş kaleminde farklı bir birim (ör. "pump") kullanılabilir, sistem
-- otomatik dönüştürür. Mevcut tablolar BOZULMAZ — hepsi nullable eklenir,
-- eski satırlar (UnitId=NULL) "zaten stok biriminde" anlamına gelir ve
-- davranışları değişmez.
--
-- DÖNÜŞÜM İKİ KATMANLI:
--   1) EVRENSEL — aynı UnitType'ta (Volume/Weight/Count), ikisinin de
--      ConversionFactorToBase'i dolu (ör. kg->g = 1000/1). Kod değişmeden
--      yeni evrensel birim eklenebilir (ör. 'oz'), sadece satır eklenir.
--   2) ÜRÜNE ÖZEL — ProductUnitConversions'ta arama (ör. "1 pump = 15 ml",
--      SADECE o üründe geçerli — başka bir üründe pump farklı ml olabilir).
-- ============================================================

-- ---------- Units ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Units')
BEGIN
    CREATE TABLE Units (
        UnitId INT IDENTITY(1,1) PRIMARY KEY,
        Code NVARCHAR(20) NOT NULL,
        Name NVARCHAR(50) NOT NULL,
        UnitType NVARCHAR(20) NOT NULL,
        ConversionFactorToBase DECIMAL(18,6) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CONSTRAINT UQ_Units_Code UNIQUE (Code),
        CONSTRAINT CK_Units_Type CHECK (UnitType IN ('Volume', 'Weight', 'Count', 'Custom')),
        CONSTRAINT CK_Units_Factor CHECK (ConversionFactorToBase IS NULL OR ConversionFactorToBase > 0)
    );

    -- Standart (evrensel) birimler — her UnitType'ın "taban" birimi
    -- ConversionFactorToBase = 1 alınır (ml Volume'un tabanı, g Weight'in
    -- tabanı, adet Count'un tabanı).
    INSERT INTO Units (Code, Name, UnitType, ConversionFactorToBase) VALUES
        (N'ml', N'Mililitre', N'Volume', 1),
        (N'l', N'Litre', N'Volume', 1000),
        (N'g', N'Gram', N'Weight', 1),
        (N'kg', N'Kilogram', N'Weight', 1000),
        (N'adet', N'Adet', N'Count', 1),
        -- 'porsiyon': ürüne özel birim (ör. "1 pump", "1 tot") — evrensel bir
        -- ml/g karşılığı YOKTUR (ConversionFactorToBase=NULL), her ürün kendi
        -- oranını ProductUnitConversions'ta tanımlar.
        (N'porsiyon', N'Porsiyon', N'Custom', NULL);
END

-- ---------- ProductUnitConversions ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProductUnitConversions')
BEGIN
    CREATE TABLE ProductUnitConversions (
        ProductId INT NOT NULL,
        FromUnitId INT NOT NULL,
        ToUnitId INT NOT NULL,
        Factor DECIMAL(18,6) NOT NULL,
        CONSTRAINT PK_ProductUnitConversions PRIMARY KEY (ProductId, FromUnitId, ToUnitId),
        CONSTRAINT FK_PUC_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
        CONSTRAINT FK_PUC_FromUnit FOREIGN KEY (FromUnitId) REFERENCES Units(UnitId),
        CONSTRAINT FK_PUC_ToUnit FOREIGN KEY (ToUnitId) REFERENCES Units(UnitId),
        CONSTRAINT CK_PUC_Factor CHECK (Factor > 0),
        CONSTRAINT CK_PUC_NotSelf CHECK (FromUnitId <> ToUnitId)
    );
END

-- ---------- Products.StockUnitId ----------
-- NULL = "eski davranış" (dönüşüm hiç uygulanmaz, Quantity zaten doğru
-- sayılır) — mevcut ürünler etkilenmez, sadece isteyerek yapılandırılan
-- ürünlerde devreye girer.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'StockUnitId')
BEGIN
    ALTER TABLE Products ADD StockUnitId INT NULL
        CONSTRAINT FK_Products_StockUnit FOREIGN KEY REFERENCES Units(UnitId);
END

-- ---------- Recipes.UnitId / OrderDetailExtras.UnitId / OrderDetailSyrups.UnitId ----------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Recipes') AND name = 'UnitId')
BEGIN
    ALTER TABLE Recipes ADD UnitId INT NULL
        CONSTRAINT FK_Recipes_Unit FOREIGN KEY REFERENCES Units(UnitId);
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OrderDetailExtras') AND name = 'UnitId')
BEGIN
    ALTER TABLE OrderDetailExtras ADD UnitId INT NULL
        CONSTRAINT FK_ODE_Unit FOREIGN KEY REFERENCES Units(UnitId);
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OrderDetailSyrups') AND name = 'UnitId')
BEGIN
    ALTER TABLE OrderDetailSyrups ADD UnitId INT NULL
        CONSTRAINT FK_ODS_Unit FOREIGN KEY REFERENCES Units(UnitId);
END

-- ---------- Products.ServingSize'dan (eski sistem) veri taşıma ----------
-- ServingSize'ı olan (Aug 2026 turunda eklenen) şuruplar için: StockUnitId=ml
-- atanır, "porsiyon -> ml" dönüşümü ProductUnitConversions'a yazılır.
-- ServingSize kolonunun KENDİSİ SİLİNMEZ (geriye dönük uyumluluk, "mevcut
-- tabloları bozma" ilkesi) ama YENİ kod artık bunun yerine bu sistemi
-- kullanır (bkz. utils/unitConversion.js).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'ServingSize')
BEGIN
    -- StockUnitId bu batch'te YENİ eklendi — aynı batch içindeki bir
    -- sorgunun ona referans vermesi derleme zamanında "Invalid column
    -- name" hatası verir (bkz. 2026_07_27_add_table_area.sql'deki not).
    -- EXEC ile dinamik SQL çalışma zamanına ertelenir.
    EXEC('
        DECLARE @MlUnitId INT = (SELECT UnitId FROM Units WHERE Code = N''ml'');
        DECLARE @PorsiyonUnitId INT = (SELECT UnitId FROM Units WHERE Code = N''porsiyon'');

        UPDATE Products SET StockUnitId = @MlUnitId
        WHERE ServingSize IS NOT NULL AND StockUnitId IS NULL;

        INSERT INTO ProductUnitConversions (ProductId, FromUnitId, ToUnitId, Factor)
        SELECT p.ProductId, @PorsiyonUnitId, @MlUnitId, p.ServingSize
        FROM Products p
        WHERE p.ServingSize IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM ProductUnitConversions puc
              WHERE puc.ProductId = p.ProductId AND puc.FromUnitId = @PorsiyonUnitId AND puc.ToUnitId = @MlUnitId
          );
    ');
END

-- ---------- dbo.fn_ProductUnitFactor — performanslı (inline TVF) dönüşüm ----------
-- Scalar UDF DEĞİL: SQL Server'da scalar fonksiyonlar satır-satır çalışıp
-- paralelliği/index kullanımını bozar. Inline TVF (tek SELECT, RETURNS
-- TABLE) sorgu planına GÖMÜLÜR, normal bir JOIN gibi optimize edilir —
-- raporlarda büyük veri setlerinde performans farkı büyük olur.
EXEC('
CREATE OR ALTER FUNCTION dbo.fn_ProductUnitFactor(@ProductId INT, @FromUnitId INT, @ToUnitId INT)
RETURNS TABLE AS RETURN (
    SELECT CASE
        WHEN @FromUnitId = @ToUnitId OR @FromUnitId IS NULL THEN CAST(1 AS DECIMAL(18,6))
        ELSE COALESCE(
            (SELECT fu.ConversionFactorToBase / tu.ConversionFactorToBase
             FROM Units fu CROSS JOIN Units tu
             WHERE fu.UnitId = @FromUnitId AND tu.UnitId = @ToUnitId
               AND fu.UnitType = tu.UnitType
               AND fu.ConversionFactorToBase IS NOT NULL AND tu.ConversionFactorToBase IS NOT NULL),
            (SELECT Factor FROM ProductUnitConversions
             WHERE ProductId = @ProductId AND FromUnitId = @FromUnitId AND ToUnitId = @ToUnitId),
            CAST(1 AS DECIMAL(18,6)) -- dönüşüm tanımlı değilse GÜVENLİ VARSAYILAN: 1 (eski davranış, sessiz hata yerine)
        )
    END AS Factor
);
');
