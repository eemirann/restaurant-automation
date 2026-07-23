-- Stok modülünden doğrudan yeni "hammadde" (menüde satılmayan) ürün girilebilmesi için.
-- IsRawMaterial=1 olan ürünler menüde/sipariş ekranında hiç görünmez (getAllProducts filtreler).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'IsRawMaterial')
BEGIN
    ALTER TABLE Products ADD IsRawMaterial BIT NOT NULL DEFAULT 0;
END

-- Hammadde ürünlerin bağlanacağı, menüde hiç görünmeyen özel kategori.
IF NOT EXISTS (SELECT 1 FROM Categories WHERE Name = 'Hammadde')
BEGIN
    INSERT INTO Categories (Name, IsActive) VALUES ('Hammadde', 0);
END
