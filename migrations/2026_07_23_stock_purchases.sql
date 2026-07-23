-- Stok alım (satın alma) kayıtlarını tutar: tedarikçi, fatura no, birim fiyat, not.
-- Stok kalemi silinirse alım geçmişi de onunla birlikte silinir (CASCADE).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'StockPurchases')
BEGIN
    CREATE TABLE StockPurchases (
        StockPurchaseId INT IDENTITY(1,1) PRIMARY KEY,
        StockId INT NOT NULL,
        Quantity INT NOT NULL,
        UnitPrice DECIMAL(10, 2) NULL,
        Supplier NVARCHAR(150) NULL,
        InvoiceNumber NVARCHAR(50) NULL,
        Notes NVARCHAR(500) NULL,
        PurchaseDate DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_StockPurchases_Stock FOREIGN KEY (StockId) REFERENCES Stock(StockId) ON DELETE CASCADE
    );
END
