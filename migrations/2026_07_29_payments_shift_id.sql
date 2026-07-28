-- ============================================================
-- Vardiya devri (transferShift) sırasında beklenen nakit hesabı bozuluyordu:
-- computeExpectedCash sadece Shifts.UserId (devir SONRASI kullanıcı) ile
-- Payments.CreatedBy'ı eşleştiriyordu, devir ÖNCESİ kasiyerin topladığı nakit
-- artık hiçbir açık vardiyaya ait sayılmıyordu. Kalıcı çözüm: her ödemeyi,
-- oluşturulduğu ANDAki açık vardiyaya (ShiftId) sabitlemek — devirde
-- Shifts.UserId değişse bile ShiftId aynı kalır, ödeme her zaman doğru
-- vardiyaya ait sayılır.
-- NULL bırakılıyor: bu migration'dan önce oluşturulmuş Payments satırları
-- (geçmiş veri) için ShiftId bilinmiyor; controllers/shiftController.js
-- computeExpectedCash bu eski satırlar için eski (CreatedBy tabanlı) mantığı
-- geriye dönük uyumluluk amacıyla ayrıca hesaba katar.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Payments') AND name = 'ShiftId')
BEGIN
    ALTER TABLE Payments ADD ShiftId INT NULL
        CONSTRAINT FK_Payments_ShiftId REFERENCES Shifts(ShiftId);
END
