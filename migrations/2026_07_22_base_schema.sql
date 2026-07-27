-- ============================================================
-- BAZ ŞEMA (çekirdek tablolar)
--
-- ÖNEMLİ: Bu dosya, uygulama kodundaki SQL sorgularından YENİDEN
-- KURGULANMIŞTIR; canlı veritabanının birebir kopyası olmayabilir.
-- Tüm tablolar IF NOT EXISTS ile korunur -> MEVCUT bir veritabanında
-- HİÇBİR ŞEYİ değiştirmez/silmez (no-op). Yalnızca SIFIRDAN kurulumda
-- eksik çekirdek tabloları oluşturur.
--
-- Üretim şemasının kesin kaynağı için canlı DB'den script üretin
-- (SSMS "Generate Scripts" veya mssql-scripter) ve bu dosyayla
-- karşılaştırın.
--
-- ÇALIŞTIRMA SIRASI: Bu dosya EN ÖNCE çalıştırılmalı, ardından
-- migrations/ altındaki tarih sıralı diğer dosyalar.
-- ============================================================

-- ---------- Categories ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Categories')
BEGIN
    CREATE TABLE Categories (
        CategoryId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(150) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1
    );
END

-- ---------- Users ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        UserId INT IDENTITY(1,1) PRIMARY KEY,
        FullName NVARCHAR(150) NOT NULL,
        UserName NVARCHAR(100) NOT NULL UNIQUE,
        PasswordHash NVARCHAR(255) NOT NULL,
        Role NVARCHAR(20) NOT NULL DEFAULT 'Waiter',
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CK_Users_Role CHECK (Role IN ('Waiter', 'Cashier', 'Admin'))
    );
END

-- ---------- Products ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Products')
BEGIN
    CREATE TABLE Products (
        ProductId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(200) NOT NULL,
        Description NVARCHAR(500) NULL,
        Price DECIMAL(10,2) NOT NULL DEFAULT 0,
        CategoryId INT NULL,
        ImageUrl NVARCHAR(500) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CONSTRAINT FK_Products_Category FOREIGN KEY (CategoryId) REFERENCES Categories(CategoryId)
    );
END

-- ---------- ProductVariants ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProductVariants')
BEGIN
    CREATE TABLE ProductVariants (
        ProductVariantsId INT IDENTITY(1,1) PRIMARY KEY,
        ProductId INT NOT NULL,
        Name NVARCHAR(100) NULL,
        Price DECIMAL(10,2) NOT NULL DEFAULT 0,
        CONSTRAINT FK_ProductVariants_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId)
    );
END

-- ---------- Tables ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Tables')
BEGIN
    CREATE TABLE Tables (
        TableId INT IDENTITY(1,1) PRIMARY KEY,
        TableNumber INT NOT NULL,
        Capacity INT NOT NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Empty',
        CONSTRAINT CK_Tables_Status CHECK (Status IN ('Empty', 'Occupied', 'Reserved'))
    );
END

-- ---------- Orders ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Orders')
BEGIN
    CREATE TABLE Orders (
        OrderId INT IDENTITY(1,1) PRIMARY KEY,
        TableId INT NOT NULL,
        UserId INT NULL,
        TotalAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        Note NVARCHAR(MAX) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_Orders_Table FOREIGN KEY (TableId) REFERENCES Tables(TableId),
        CONSTRAINT FK_Orders_User FOREIGN KEY (UserId) REFERENCES Users(UserId),
        CONSTRAINT CK_Orders_Status CHECK (Status IN ('Pending', 'Served', 'Paid', 'Cancelled', 'Merged'))
    );
END

-- ---------- OrderDetails ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OrderDetails')
BEGIN
    CREATE TABLE OrderDetails (
        OrderDetailsId INT IDENTITY(1,1) PRIMARY KEY,
        OrderId INT NOT NULL,
        ProductId INT NOT NULL,
        Quantity INT NOT NULL,
        UnitPrice DECIMAL(10,2) NOT NULL,
        VariantId INT NULL,
        Note NVARCHAR(500) NULL,
        CONSTRAINT FK_OrderDetails_Order FOREIGN KEY (OrderId) REFERENCES Orders(OrderId),
        CONSTRAINT FK_OrderDetails_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId),
        CONSTRAINT UQ_Order_Product UNIQUE (OrderId, ProductId)
    );
END

-- ---------- Payments ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Payments')
BEGIN
    CREATE TABLE Payments (
        PaymentsId INT IDENTITY(1,1) PRIMARY KEY,
        OrderId INT NOT NULL,
        Amount DECIMAL(10,2) NOT NULL,
        TipAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
        DiscountAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
        PaymentMethod NVARCHAR(20) NOT NULL,
        InvoiceNumber NVARCHAR(50) NULL,
        PaymentDate DATETIME NOT NULL DEFAULT GETDATE(),
        RefundAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
        RefundDate DATETIME NULL,
        RefundedBy INT NULL,
        IsDeleted BIT NOT NULL DEFAULT 0,
        DeletedBy INT NULL,
        CreatedBy INT NULL,
        CONSTRAINT FK_Payments_Order FOREIGN KEY (OrderId) REFERENCES Orders(OrderId),
        CONSTRAINT CK_Payments_Method CHECK (PaymentMethod IN ('Cash', 'Card', 'FoodCard', 'QR'))
    );
END

-- ---------- Reservations ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Reservations')
BEGIN
    CREATE TABLE Reservations (
        ReservationId INT IDENTITY(1,1) PRIMARY KEY,
        TableId INT NOT NULL,
        CustomerName NVARCHAR(150) NOT NULL,
        CustomerPhone NVARCHAR(30) NULL,
        PartySize INT NULL,
        ReservationTime DATETIME NOT NULL,
        Note NVARCHAR(500) NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
        CreatedByUserId INT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_Reservations_Table FOREIGN KEY (TableId) REFERENCES Tables(TableId),
        CONSTRAINT CK_Reservations_Status CHECK (Status IN ('Active', 'Cancelled'))
    );
END

-- ---------- TableTransferLog ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TableTransferLog')
BEGIN
    CREATE TABLE TableTransferLog (
        TableTransferLogId INT IDENTITY(1,1) PRIMARY KEY,
        OrderId INT NOT NULL,
        FromTableId INT NULL,
        ToTableId INT NULL,
        TransferType NVARCHAR(20) NOT NULL,
        MergedIntoOrderId INT NULL,
        TransferredByUserId INT NULL,
        Reason NVARCHAR(500) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CK_TableTransferLog_Type CHECK (TransferType IN ('Move', 'Merge'))
    );
END

-- ---------- Stock ----------
-- NOT: Quantity/MinStockLevel burada INT oluşturulur; kesirli stok için
-- 2026_07_27_stock_decimal.sql bunları DECIMAL(10,3)'e yükseltir.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Stock')
BEGIN
    CREATE TABLE Stock (
        StockId INT IDENTITY(1,1) PRIMARY KEY,
        ProductId INT NOT NULL UNIQUE,
        Quantity INT NOT NULL DEFAULT 0,
        MinStockLevel INT NOT NULL DEFAULT 0,
        IsTracked BIT NOT NULL DEFAULT 1,
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_Stock_Product FOREIGN KEY (ProductId) REFERENCES Products(ProductId)
    );
END

-- ---------- Trigger: sipariş 'Paid' olunca masayı boşalt ----------
-- (Başka aktif sipariş kalmadıysa). Uygulama koduna göre iptal ('Cancelled')
-- durumunu tetikleyici DEĞİL, controller yönetir.
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'TR_Orders_EmptyTableOnPaid')
BEGIN
    EXEC('
        CREATE TRIGGER TR_Orders_EmptyTableOnPaid ON Orders AFTER UPDATE AS
        BEGIN
            SET NOCOUNT ON;
            IF UPDATE(Status)
            BEGIN
                UPDATE t SET Status = ''Empty''
                FROM Tables t
                JOIN inserted i ON i.TableId = t.TableId
                WHERE i.Status = ''Paid''
                  AND NOT EXISTS (
                      SELECT 1 FROM Orders o
                      WHERE o.TableId = t.TableId
                        AND o.Status NOT IN (''Paid'', ''Cancelled'', ''Merged'')
                  );
            END
        END
    ');
END
