-- ============================================================
-- MÜŞTERİ QR MENÜSÜ
--
-- Her masaya özel, tahmin edilemez bir QR token (Tables.QrToken).
-- Müşteri /menu/:qrToken linkini QR ile açar; bu token backend'de
-- SADECE o masaya erişim sağlar, kimlik doğrulaması (JWT) YOKTUR —
-- bu yüzden anonim uçlar sıkı rate-limit'lidir (bkz. routes/publicMenu.js).
--
-- Müşterinin gönderdiği sipariş DOĞRUDAN Orders'a yazılmaz — önce
-- CustomerOrderRequests'e "Pending" olarak düşer, personel onaylayınca
-- gerçek Orders/OrderDetails kaydı (mevcut createOrder mantığıyla,
-- fiyat sunucuda yeniden hesaplanarak) oluşturulur. Böylece yanlışlıkla
-- veya kötü niyetle gönderilen bir istek asla doğrudan mutfağa/kasaya
-- düşmez ve mevcut Orders.Status akışına (Pending/Served/Paid/...)
-- hiç dokunulmaz.
--
-- Ekstra/şurup seçimleri CustomerOrderRequestItems'ta JSON olarak
-- tutulur (ExtrasJson/SyrupsJson: [{"ExtraProductId":1,"Quantity":2}]
-- gibi) — bu veri geçici/onay bekleyen bir taslak olduğu için ayrı
-- normalize tablolar yerine JSON yeterli; onaylanınca zaten mevcut
-- OrderDetailExtras/OrderDetailSyrups'a normalize edilerek yazılır.
-- ============================================================

-- ---------- Tables.QrToken ----------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Tables') AND name = 'QrToken')
BEGIN
    ALTER TABLE Tables ADD QrToken NVARCHAR(64) NULL
        CONSTRAINT DF_Tables_QrToken DEFAULT (REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''));

    -- Aynı batch içinde yeni eklenen kolona referans (UPDATE/ALTER COLUMN/
    -- ADD CONSTRAINT) derleme zamanında "Invalid column name" hatası verir
    -- (bkz. 2026_07_27_add_table_area.sql'deki not) — dinamik SQL (EXEC)
    -- bu kontrolü çalışma zamanına erteler.
    EXEC('UPDATE Tables SET QrToken = REPLACE(CONVERT(VARCHAR(36), NEWID()), ''-'', '''') WHERE QrToken IS NULL');
    EXEC('ALTER TABLE Tables ALTER COLUMN QrToken NVARCHAR(64) NOT NULL');
    EXEC('ALTER TABLE Tables ADD CONSTRAINT UQ_Tables_QrToken UNIQUE (QrToken)');
END

-- ---------- CustomerOrderRequests ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CustomerOrderRequests')
BEGIN
    CREATE TABLE CustomerOrderRequests (
        CustomerOrderRequestId INT IDENTITY(1,1) PRIMARY KEY,
        TableId INT NOT NULL,
        Note NVARCHAR(500) NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        RejectionReason NVARCHAR(255) NULL,
        ApprovedOrderId INT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        ResolvedAt DATETIME NULL,
        ResolvedByUserId INT NULL,
        CONSTRAINT FK_CustomerOrderRequests_Table FOREIGN KEY (TableId) REFERENCES Tables(TableId),
        CONSTRAINT FK_CustomerOrderRequests_Order FOREIGN KEY (ApprovedOrderId) REFERENCES Orders(OrderId),
        CONSTRAINT FK_CustomerOrderRequests_ResolvedBy FOREIGN KEY (ResolvedByUserId) REFERENCES Users(UserId),
        CONSTRAINT CK_CustomerOrderRequests_Status CHECK (Status IN ('Pending', 'Approved', 'Rejected'))
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CustomerOrderRequestItems')
BEGIN
    CREATE TABLE CustomerOrderRequestItems (
        CustomerOrderRequestItemId INT IDENTITY(1,1) PRIMARY KEY,
        CustomerOrderRequestId INT NOT NULL,
        ProductId INT NOT NULL,
        Quantity INT NOT NULL,
        VariantId INT NULL,
        Note NVARCHAR(255) NULL,
        ExtrasJson NVARCHAR(MAX) NULL,
        SyrupsJson NVARCHAR(MAX) NULL,
        CONSTRAINT FK_CustomerOrderRequestItems_Request FOREIGN KEY (CustomerOrderRequestId) REFERENCES CustomerOrderRequests(CustomerOrderRequestId) ON DELETE CASCADE,
        CONSTRAINT FK_CustomerOrderRequestItems_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
        CONSTRAINT FK_CustomerOrderRequestItems_Variant FOREIGN KEY (VariantId) REFERENCES ProductVariants(ProductVariantsId),
        CONSTRAINT CK_CustomerOrderRequestItems_Quantity CHECK (Quantity > 0)
    );
END

-- ---------- ServiceRequests (Garson çağır / hesap / su / peçete / çatal-bıçak) ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ServiceRequests')
BEGIN
    CREATE TABLE ServiceRequests (
        ServiceRequestId INT IDENTITY(1,1) PRIMARY KEY,
        TableId INT NOT NULL,
        Type NVARCHAR(20) NOT NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        ResolvedAt DATETIME NULL,
        ResolvedByUserId INT NULL,
        CONSTRAINT FK_ServiceRequests_Table FOREIGN KEY (TableId) REFERENCES Tables(TableId),
        CONSTRAINT FK_ServiceRequests_ResolvedBy FOREIGN KEY (ResolvedByUserId) REFERENCES Users(UserId),
        CONSTRAINT CK_ServiceRequests_Type CHECK (Type IN ('CallWaiter', 'RequestBill', 'AskForWater', 'NeedNapkins', 'ExtraCutlery')),
        CONSTRAINT CK_ServiceRequests_Status CHECK (Status IN ('Pending', 'Resolved'))
    );
END
