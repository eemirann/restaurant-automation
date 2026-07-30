-- ============================================================
-- VARDİYA KAYDI SOFT-DELETE
--
-- stockController'daki IsTracked deseniyle BİREBİR AYNI felsefe: gerçek
-- DELETE YOK, sadece IsDeleted=1 ile gizlenir. listShifts varsayılan
-- olarak IsDeleted=0 filtreler; ?includeDeleted=1 ile Admin silinmiş
-- kayıtları da görebilir (bkz. controllers/shiftController.js
-- deleteShift/restoreShift).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Shifts') AND name = 'IsDeleted')
BEGIN
    ALTER TABLE Shifts ADD IsDeleted BIT NOT NULL
        CONSTRAINT DF_Shifts_IsDeleted DEFAULT 0;
END
