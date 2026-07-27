-- ============================================================
-- Denetim günlüğü: kritik/hassas aksiyonların kim-ne-ne zaman kaydı
-- (sipariş iptali, iade, ödeme silme, indirim, masa transferi, 86,
-- vardiya aç/kapa). Details JSON serbest metin olarak tutulur.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AuditLog')
BEGIN
    CREATE TABLE AuditLog (
        AuditLogId INT IDENTITY(1,1) PRIMARY KEY,
        UserId INT NULL,
        Action NVARCHAR(50) NOT NULL,
        EntityType NVARCHAR(50) NULL,
        EntityId INT NULL,
        Details NVARCHAR(MAX) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_AuditLog_User FOREIGN KEY (UserId) REFERENCES Users(UserId)
    );
END
