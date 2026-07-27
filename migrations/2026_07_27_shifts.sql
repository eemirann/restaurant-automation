-- ============================================================
-- Vardiya / kasa yönetimi. Bir kasiyer vardiya açar (açılış kasası),
-- kapatırken saydığı nakit girilir; beklenen nakit (açılış + vardiya
-- boyunca bu kasiyerin aldığı net nakit ödemeler) ile farkı hesaplanır.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Shifts')
BEGIN
    CREATE TABLE Shifts (
        ShiftId INT IDENTITY(1,1) PRIMARY KEY,
        UserId INT NOT NULL,
        OpeningFloat DECIMAL(10,2) NOT NULL DEFAULT 0,   -- açılış kasası
        OpenedAt DATETIME NOT NULL DEFAULT GETDATE(),
        ClosedAt DATETIME NULL,
        CountedCash DECIMAL(10,2) NULL,                  -- kapanışta sayılan nakit
        ExpectedCash DECIMAL(10,2) NULL,                 -- beklenen nakit (açılış + net nakit satış)
        Difference DECIMAL(10,2) NULL,                   -- sayılan - beklenen
        Status NVARCHAR(20) NOT NULL DEFAULT 'Open',
        Note NVARCHAR(500) NULL,
        CONSTRAINT FK_Shifts_User FOREIGN KEY (UserId) REFERENCES Users(UserId),
        CONSTRAINT CK_Shifts_Status CHECK (Status IN ('Open', 'Closed'))
    );
END
