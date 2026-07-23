-- Her stok artis/azalisinin gecmisini tutar (IN = artis, OUT = azalis).
-- Stok kalemi silinirse hareket gecmisi de onunla birlikte silinir (CASCADE).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'StockMovements')
BEGIN
    CREATE TABLE StockMovements (
        StockMovementId INT IDENTITY(1,1) PRIMARY KEY,
        StockId INT NOT NULL,
        Quantity INT NOT NULL,
        MovementType NVARCHAR(10) NOT NULL,
        Reason NVARCHAR(255) NULL,
        MovementDate DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_StockMovements_Stock FOREIGN KEY (StockId) REFERENCES Stock(StockId) ON DELETE CASCADE,
        CONSTRAINT CK_StockMovements_Type CHECK (MovementType IN ('IN', 'OUT'))
    );
END
