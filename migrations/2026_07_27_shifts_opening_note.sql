-- ============================================================
-- Vardiya açılış notu (kapanış notu Shifts.Note'ta zaten var).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Shifts') AND name = 'OpeningNote')
BEGIN
    ALTER TABLE Shifts ADD OpeningNote NVARCHAR(500) NULL;
END
