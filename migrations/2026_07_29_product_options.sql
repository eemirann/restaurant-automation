-- ============================================================
-- ŞURUPLAR (vanilya, karamel, fındık, çikolata vb.)
--
-- 2026_07_28_extras.sql'deki Ekstra deseninin birebir aynısı:
-- Products tablosunda IsSyrup=1 olarak saklanır (controllers/syrupController.js
-- bunları yönetir), menüde/POS ürün listesinde görünmez, "Şurup" kategorisine
-- bağlanır. Ekstralardan ayrı tutuluyor çünkü panelde ayrı bir bölüm olarak
-- yönetiliyorlar (bkz. ürün düzenleme ekranındaki "İzin Verilen Ekstralar" /
-- "İzin Verilen Şuruplar" ayrımı).
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'IsSyrup')
BEGIN
    ALTER TABLE Products ADD IsSyrup BIT NOT NULL DEFAULT 0;
END

IF NOT EXISTS (SELECT 1 FROM Categories WHERE Name = 'Şurup')
BEGIN
    INSERT INTO Categories (Name, IsActive) VALUES ('Şurup', 0);
END

-- Bir sipariş kalemine seçilen şuruplar — OrderDetailExtras ile birebir aynı
-- desen (adet + o anki fiyat snapshot'ı, kalemin kendi Quantity'siyle çarpılır).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OrderDetailSyrups')
BEGIN
    CREATE TABLE OrderDetailSyrups (
        OrderDetailSyrupId INT IDENTITY(1,1) PRIMARY KEY,
        OrderDetailsId INT NOT NULL,
        SyrupProductId INT NOT NULL,
        Quantity INT NOT NULL,
        UnitPrice DECIMAL(10,2) NOT NULL,
        CONSTRAINT FK_OrderDetailSyrups_OrderDetails FOREIGN KEY (OrderDetailsId) REFERENCES OrderDetails(OrderDetailsId) ON DELETE CASCADE,
        CONSTRAINT FK_OrderDetailSyrups_Product FOREIGN KEY (SyrupProductId) REFERENCES Products(ProductId),
        CONSTRAINT CK_OrderDetailSyrups_Quantity CHECK (Quantity > 0)
    );
END

-- ============================================================
-- ÜRÜN BAZLI OPSİYON YÖNETİMİ
--
-- Hangi ekstra/şurubun hangi üründe satılabilir olduğunu belirler (ör. "Ekstra
-- Shot" sadece Ice Latte'de görünsün, Cheesecake'de hiç görünmesin). Ürün
-- düzenleme ekranındaki "İzin Verilen Ekstralar/Şuruplar" bölümü bu tabloları
-- yönetir (bkz. controllers/productController.js: getProductOptions/
-- saveProductOptions). DisplayOrder yöneticinin belirlediği sırayı, IsEnabled
-- ise siparişe eklenmeden önce geçici olarak kapatılabilmesini sağlar (silmeden
-- "şu an yok" demek gibi — Ekstralar'daki IsActive'e benzer ama ürüne özel).
-- Sipariş ekranı (GET /api/products/:id/order-options) sadece IsEnabled=1 VE
-- opsiyonun kendisi IsActive=1 olanları döner.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProductExtras')
BEGIN
    CREATE TABLE ProductExtras (
        ProductId INT NOT NULL,
        ExtraProductId INT NOT NULL,
        DisplayOrder INT NOT NULL DEFAULT 0,
        IsEnabled BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_ProductExtras PRIMARY KEY (ProductId, ExtraProductId),
        CONSTRAINT FK_ProductExtras_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
        CONSTRAINT FK_ProductExtras_Extra FOREIGN KEY (ExtraProductId) REFERENCES Products(ProductId)
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProductSyrups')
BEGIN
    CREATE TABLE ProductSyrups (
        ProductId INT NOT NULL,
        SyrupProductId INT NOT NULL,
        DisplayOrder INT NOT NULL DEFAULT 0,
        IsEnabled BIT NOT NULL DEFAULT 1,
        CONSTRAINT PK_ProductSyrups PRIMARY KEY (ProductId, SyrupProductId),
        CONSTRAINT FK_ProductSyrups_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
        CONSTRAINT FK_ProductSyrups_Syrup FOREIGN KEY (SyrupProductId) REFERENCES Products(ProductId)
    );
END
