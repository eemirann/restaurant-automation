-- ============================================================
-- KAMPANYA/COMBO MOTORU + KULLANICI ADI BAZLI SADAKAT SİSTEMİ
--
-- 1) Kampanyalar: müşteri QR menüsünün üstünde gösterilen bir karüsel.
--    İki tür: 'Info' (sadece bilgilendirme kartı, dokununca bir şey
--    olmaz) ve 'Combo' (ComboOffers'a bağlı, sepete eklenebilir sabit
--    fiyatlı ürün paketi — bkz. utils/orderBuilder.js Combos desteği).
--
-- 2) Sadaklık: kimlik doğrulaması YOK — müşteri checkout'ta sadece bir
--    kullanıcı adı yazar (bkz. musteri-menu CartView.jsx). Sipariş
--    onaylanınca (approveCustomerOrderRequest) o kullanıcı adına puan
--    işlenir. PIN alanı bu turda SADECE backend altyapısı olarak durur,
--    hiçbir arayüzde PIN girme/isteme YOKTUR (kapsam dışı bırakıldı).
--
-- Mevcut migration'lardaki IF NOT EXISTS + yorum deseniyle yazılmıştır
-- (bkz. 2026_07_31_qr_customer_menu.sql). Aynı batch içinde YENİ
-- eklenen bir koloni doğrudan referans alan (UPDATE/ALTER COLUMN/ADD
-- CONSTRAINT) ifadeler yoksa EXEC ile ertelemeye gerek yoktur — bu
-- dosyadaki tüm ALTER TABLE ADD'ler tek başına yeterlidir (QrToken
-- migration'ındaki EXEC ihtiyacı, aynı ADD ifadesinden hemen sonra o
-- kolonu bir UPDATE'te kullanmaktan kaynaklanıyordu, burada öyle bir
-- durum yok).
-- ============================================================

-- ---------- ComboOffers (Campaigns'ten ÖNCE oluşturulmalı — FK) ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ComboOffers')
BEGIN
    CREATE TABLE ComboOffers (
        ComboOfferId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(150) NOT NULL,
        Price DECIMAL(10,2) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ComboOfferItems')
BEGIN
    CREATE TABLE ComboOfferItems (
        ComboOfferItemId INT IDENTITY(1,1) PRIMARY KEY,
        ComboOfferId INT NOT NULL,
        ProductId INT NOT NULL,
        Quantity INT NOT NULL,
        CONSTRAINT FK_ComboOfferItems_ComboOffer FOREIGN KEY (ComboOfferId) REFERENCES ComboOffers(ComboOfferId) ON DELETE CASCADE,
        CONSTRAINT FK_ComboOfferItems_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
        CONSTRAINT CK_ComboOfferItems_Quantity CHECK (Quantity > 0)
    );
END

-- ---------- Campaigns ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Campaigns')
BEGIN
    CREATE TABLE Campaigns (
        CampaignId INT IDENTITY(1,1) PRIMARY KEY,
        Title NVARCHAR(150) NOT NULL,
        Description NVARCHAR(500) NULL,
        ImageUrl NVARCHAR(255) NULL,
        StartAt DATETIME NOT NULL,
        EndAt DATETIME NOT NULL,
        DisplayOrder INT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        CampaignType NVARCHAR(20) NOT NULL DEFAULT 'Info',
        ComboOfferId INT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CK_Campaigns_Type CHECK (CampaignType IN ('Info', 'Combo')),
        CONSTRAINT FK_Campaigns_ComboOffer FOREIGN KEY (ComboOfferId) REFERENCES ComboOffers(ComboOfferId)
    );

    CREATE INDEX IX_Campaigns_Active_Dates ON Campaigns(IsActive, StartAt, EndAt);
END

-- ---------- OrderDetails.ComboOfferId ----------
-- Bir combo'nun her bileşeni kendi OrderDetail satırı olarak yazılır
-- (KDS gerçek ürünleri görsün, stok/BOM normal düşsün — bkz.
-- utils/orderBuilder.js). Bu kolon, o satırların hangi combo'ya ait
-- olduğunu işaretler (raporlama/iade için); fiyatın kendisi tek bir
-- bileşen satırına yüklenir (ilk satır = combo.Price, diğerleri 0).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OrderDetails') AND name = 'ComboOfferId')
BEGIN
    ALTER TABLE OrderDetails ADD ComboOfferId INT NULL
        CONSTRAINT FK_OrderDetails_ComboOffer FOREIGN KEY REFERENCES ComboOffers(ComboOfferId);
END

-- ---------- AppSettings.LoyaltyPointsRate ----------
-- 100 TL harcamaya kaç puan verileceği (varsayılan: 10 puan / 100 TL).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'LoyaltyPointsRate')
BEGIN
    ALTER TABLE AppSettings ADD LoyaltyPointsRate DECIMAL(5,2) NOT NULL
        CONSTRAINT DF_AppSettings_LoyaltyPointsRate DEFAULT 10;
END

-- ---------- CustomerOrderRequests.Username ----------
-- Checkout'ta müşteri kullanıcı adı girerse taşınır (opsiyonel).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrderRequests') AND name = 'Username')
BEGIN
    ALTER TABLE CustomerOrderRequests ADD Username NVARCHAR(50) NULL;
END

-- ---------- CustomerOrderRequests.CombosJson ----------
-- Sepetteki combo seçimleri ([{"ComboOfferId":1,"Quantity":2}] gibi) —
-- CustomerOrderRequestItems ürün bazlı olduğu için combo'lar burada JSON
-- taslak olarak tutulur; onaylanınca (approveCustomerOrderRequest)
-- utils/orderBuilder.js'e Combos olarak aynen geçirilir ve gerçek
-- OrderDetails satırlarına (her bileşen kendi satırı) açılır.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrderRequests') AND name = 'CombosJson')
BEGIN
    ALTER TABLE CustomerOrderRequests ADD CombosJson NVARCHAR(MAX) NULL;
END

-- ---------- Products.LoyaltyPointCost ----------
-- Admin bir ürünü "X puana bedava" olarak işaretlerse dolar (opsiyonel).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'LoyaltyPointCost')
BEGIN
    ALTER TABLE Products ADD LoyaltyPointCost INT NULL;
END

-- ---------- Customers ----------
-- Username CASE-INSENSITIVE karşılaştırılır (Latin1_General_CI_AS) —
-- "Ahmet" ve "ahmet" aynı müşteri sayılır, DB'nin varsayılan collation'ı
-- ne olursa olsun (bkz. controllers/customerOrderController.js:
-- find-or-create sorgusu bu kolonu WHERE Username = @Username ile
-- karşılaştırır, ekstra LOWER() gerekmez).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Customers')
BEGIN
    CREATE TABLE Customers (
        CustomerId INT IDENTITY(1,1) PRIMARY KEY,
        Username NVARCHAR(50) COLLATE Latin1_General_CI_AS NOT NULL,
        Pin NVARCHAR(255) NULL, -- SET EDİLİRSE bcrypt hash olarak saklanır, ASLA düz metin
        LoyaltyPoints INT NOT NULL DEFAULT 0,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );

    CREATE UNIQUE INDEX UQ_Customers_Username ON Customers(Username);
END
