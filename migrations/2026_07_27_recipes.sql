-- ============================================================
-- Reçete (BOM - Bill of Materials) tablosu.
-- Bir menü ürününün (ProductId) hangi hammaddelerden
-- (RawMaterialProductId) ne kadar tükettiğini tanımlar.
-- Sipariş oluşturulduğunda, reçetesi olan ürünler için stok
-- hammadde bazında (Quantity × satılan adet) düşülür.
-- Reçetesi olmayan ürünler eski davranışı korur (kendi stoğu düşer).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Recipes')
BEGIN
    CREATE TABLE Recipes (
        RecipeId INT IDENTITY(1,1) PRIMARY KEY,
        ProductId INT NOT NULL,               -- menü ürünü (satılan)
        RawMaterialProductId INT NOT NULL,    -- tüketilen hammadde
        Quantity DECIMAL(10,3) NOT NULL,      -- 1 adet ürün için hammadde miktarı (ör. 0.150 kg)
        Unit NVARCHAR(20) NULL,               -- serbest metin birim (gr, ml, adet...) - bilgi amaçlı
        CONSTRAINT FK_Recipes_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
        CONSTRAINT FK_Recipes_RawMaterial FOREIGN KEY (RawMaterialProductId) REFERENCES Products(ProductId),
        CONSTRAINT UQ_Recipe_Product_Material UNIQUE (ProductId, RawMaterialProductId),
        CONSTRAINT CK_Recipe_NotSelf CHECK (ProductId <> RawMaterialProductId),
        CONSTRAINT CK_Recipe_Qty_Positive CHECK (Quantity > 0)
    );
END
