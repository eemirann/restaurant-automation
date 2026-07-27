-- ============================================================
-- Stok miktarlarını kesirli (gr/ml gibi) tutabilmek için
-- Stock.Quantity, Stock.MinStockLevel, StockMovements.Quantity ve
-- StockPurchases.Quantity kolonlarını INT -> DECIMAL(10,3) yükseltir.
--
-- ÖNEMLİ: Bu SQL Server örneğinde kolona bağlı bir DEFAULT constraint,
-- ALTER COLUMN'u "one or more objects access this column" hatasıyla
-- engelliyor. Constraint adları otomatik üretildiği (her DB'de farklı)
-- için önce ADINDAN BAĞIMSIZ olarak bulunup düşürülür, kolon
-- dönüştürülür, sonra default geri eklenir (mevcut davranış korunur).
--
-- Idempotent: kolon zaten DECIMAL ise ilgili blok atlanır.
-- ============================================================

DECLARE @df NVARCHAR(128);

-- ---------- Stock.Quantity ----------
IF EXISTS (
    SELECT 1 FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('Stock') AND c.name = 'Quantity' AND t.name = 'int'
)
BEGIN
    SET @df = NULL;
    SELECT @df = dc.name FROM sys.default_constraints dc
      JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('Stock') AND c.name = 'Quantity';
    IF @df IS NOT NULL EXEC('ALTER TABLE Stock DROP CONSTRAINT [' + @df + ']');
    ALTER TABLE Stock ALTER COLUMN Quantity DECIMAL(10,3) NOT NULL;
END

-- ---------- Stock.MinStockLevel ----------
IF EXISTS (
    SELECT 1 FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('Stock') AND c.name = 'MinStockLevel' AND t.name = 'int'
)
BEGIN
    SET @df = NULL;
    SELECT @df = dc.name FROM sys.default_constraints dc
      JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('Stock') AND c.name = 'MinStockLevel';
    IF @df IS NOT NULL EXEC('ALTER TABLE Stock DROP CONSTRAINT [' + @df + ']');
    ALTER TABLE Stock ALTER COLUMN MinStockLevel DECIMAL(10,3) NOT NULL;
END

-- ---------- StockMovements.Quantity ----------
IF EXISTS (
    SELECT 1 FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('StockMovements') AND c.name = 'Quantity' AND t.name = 'int'
)
BEGIN
    SET @df = NULL;
    SELECT @df = dc.name FROM sys.default_constraints dc
      JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('StockMovements') AND c.name = 'Quantity';
    IF @df IS NOT NULL EXEC('ALTER TABLE StockMovements DROP CONSTRAINT [' + @df + ']');
    ALTER TABLE StockMovements ALTER COLUMN Quantity DECIMAL(10,3) NOT NULL;
END

-- ---------- StockPurchases.Quantity ----------
IF EXISTS (
    SELECT 1 FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('StockPurchases') AND c.name = 'Quantity' AND t.name = 'int'
)
BEGIN
    SET @df = NULL;
    SELECT @df = dc.name FROM sys.default_constraints dc
      JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('StockPurchases') AND c.name = 'Quantity';
    IF @df IS NOT NULL EXEC('ALTER TABLE StockPurchases DROP CONSTRAINT [' + @df + ']');
    ALTER TABLE StockPurchases ALTER COLUMN Quantity DECIMAL(10,3) NOT NULL;
END

-- ---------- Düşürülen DEFAULT'ları geri ekle (orijinal davranış) ----------
IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('Stock') AND c.name = 'Quantity'
)
    ALTER TABLE Stock ADD CONSTRAINT DF_Stock_Quantity DEFAULT 0 FOR Quantity;

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('Stock') AND c.name = 'MinStockLevel'
)
    ALTER TABLE Stock ADD CONSTRAINT DF_Stock_MinStockLevel DEFAULT 5 FOR MinStockLevel;
