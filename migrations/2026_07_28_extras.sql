-- ============================================================
-- EKSTRALAR (ekstra shot, ekstra çikolata, şurup vb.)
--
-- Ekstralar Products tablosunda IsExtra=1 olarak saklanır
-- (controllers/extraController.js bunları yönetir). Normal menüde/
-- POS ürün listesinde görünmezler (getAllProducts varsayılan olarak
-- IsExtra=1 olanları da hariç tutar), sadece sipariş kalemine eklenti
-- olarak seçilebilirler. Stok takibi istenirse mevcut /api/stock
-- akışıyla (ProductId vererek) aynen normal bir ürün gibi kurulur.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'IsExtra')
BEGIN
    ALTER TABLE Products ADD IsExtra BIT NOT NULL DEFAULT 0;
END

-- Products.CategoryId NOT NULL (canlı DB'de böyle) — ekstralar da hammaddeler gibi
-- menüde hiç görünmeyen özel bir kategoriye bağlanır (bkz. 2026_07_23_raw_materials.sql).
IF NOT EXISTS (SELECT 1 FROM Categories WHERE Name = 'Ekstra')
BEGIN
    INSERT INTO Categories (Name, IsActive) VALUES ('Ekstra', 0);
END

-- Bir sipariş kalemine seçilen ekstralar (adet + o anki fiyat snapshot'ı).
-- Adet, kalemin kendi Quantity'siyle ÇARPILARAK stoktan düşülür/geri eklenir
-- ve fiyatı OrderDetails.UnitPrice'a (VariantId gibi) dahil edilir; yani
-- "2 pump vanilya" seçilen bir kalemde 3 adet ürün sipariş edilirse
-- toplamda 6 pump vanilya stoktan düşer.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OrderDetailExtras')
BEGIN
    CREATE TABLE OrderDetailExtras (
        OrderDetailExtraId INT IDENTITY(1,1) PRIMARY KEY,
        OrderDetailsId INT NOT NULL,
        ExtraProductId INT NOT NULL,
        Quantity INT NOT NULL,
        UnitPrice DECIMAL(10,2) NOT NULL,
        CONSTRAINT FK_OrderDetailExtras_OrderDetails FOREIGN KEY (OrderDetailsId) REFERENCES OrderDetails(OrderDetailsId) ON DELETE CASCADE,
        CONSTRAINT FK_OrderDetailExtras_Product FOREIGN KEY (ExtraProductId) REFERENCES Products(ProductId),
        CONSTRAINT CK_OrderDetailExtras_Quantity CHECK (Quantity > 0)
    );
END

-- ============================================================
-- ESKİ ŞURUP DENEMESİ TEMİZLİĞİ
-- Syrups / OrderDetailSyrups canlı DB'de duruyordu ama hiçbir
-- uygulama kodu (controller/route) bunları hiç kullanmıyordu —
-- yarım kalmış bir deneme. Ekstralar artık Products/Stock tabanlı
-- yukarıdaki genel Extras sistemiyle karşılanıyor, bu yüzden
-- kullanılmayan eski tablolar kaldırılıyor.
-- ============================================================
IF OBJECT_ID('OrderDetailSyrups', 'U') IS NOT NULL
BEGIN
    DROP TABLE OrderDetailSyrups;
END

IF OBJECT_ID('Syrups', 'U') IS NOT NULL
BEGIN
    DROP TABLE Syrups;
END
