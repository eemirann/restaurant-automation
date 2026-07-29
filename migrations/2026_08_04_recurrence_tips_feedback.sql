-- ============================================================
-- KAMPANYA GÜNLÜK TEKRAR + BAHŞİŞ + ANKET (3 kategori/emoji)
--
-- 1) Campaigns.RecurringDailyStartTime/EndTime: doluysa kampanya HER GÜN
--    sadece o saat aralığında aktif sayılır — StartAt/EndAt (tarih
--    aralığı) ile BİRLİKTE çalışır (ikisi de sağlanmalı). Boş bırakılırsa
--    (NULL) mevcut davranış (tarih aralığı boyunca sürekli aktif) aynen
--    devam eder (bkz. controllers/campaignController.js,
--    controllers/publicMenuController.js, utils/orderBuilder.js resolveCombo).
--
-- 2) Orders.TipAmount: QR menü checkout'ta müşterinin seçtiği bahşiş
--    (bkz. musteri-menu CartView.jsx). CustomerOrderRequests üzerinden
--    approveCustomerOrderRequest içinde buildOrderInTransaction'a
--    geçirilip buraya yazılır. Kasada değiştirilebilir/kaldırılabilir
--    (bkz. restoran-panel PaymentDrawer.jsx) — müşterinin seçimi son söz
--    değildir.
--
-- 3) Feedback: 3 kategoride (Lezzet/Hizmet/Temizlik) 1-3 arası emoji puanı.
--    Anonim, oturum/ziyaret sınırı YOK — bir "memnuniyet nabzı", katı bir
--    tekillik kontrolüne gerek yok (bkz. controllers/publicMenuController.js
--    createFeedback).
--
-- Mevcut migration'lardaki IF NOT EXISTS + yorum deseniyle yazılmıştır.
-- ============================================================

-- ---------- Campaigns.RecurringDailyStartTime / RecurringDailyEndTime ----------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Campaigns') AND name = 'RecurringDailyStartTime')
BEGIN
    ALTER TABLE Campaigns ADD RecurringDailyStartTime TIME NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Campaigns') AND name = 'RecurringDailyEndTime')
BEGIN
    ALTER TABLE Campaigns ADD RecurringDailyEndTime TIME NULL;
END

-- ---------- Orders.TipAmount ----------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Orders') AND name = 'TipAmount')
BEGIN
    ALTER TABLE Orders ADD TipAmount DECIMAL(10,2) NULL DEFAULT 0;
END

-- ---------- CustomerOrderRequests.TipAmount ----------
-- Müşterinin checkout'ta seçtiği bahşiş, onay anında Orders.TipAmount'a
-- taşınana kadar burada bekler (Username/CombosJson ile aynı desen).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('CustomerOrderRequests') AND name = 'TipAmount')
BEGIN
    ALTER TABLE CustomerOrderRequests ADD TipAmount DECIMAL(10,2) NULL;
END

-- ---------- Feedback ----------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Feedback')
BEGIN
    CREATE TABLE Feedback (
        FeedbackId INT IDENTITY(1,1) PRIMARY KEY,
        TableId INT NOT NULL,
        TasteRating TINYINT NOT NULL,
        ServiceRating TINYINT NOT NULL,
        CleanlinessRating TINYINT NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_Feedback_Table FOREIGN KEY (TableId) REFERENCES Tables(TableId),
        CONSTRAINT CK_Feedback_TasteRating CHECK (TasteRating BETWEEN 1 AND 3),
        CONSTRAINT CK_Feedback_ServiceRating CHECK (ServiceRating BETWEEN 1 AND 3),
        CONSTRAINT CK_Feedback_CleanlinessRating CHECK (CleanlinessRating BETWEEN 1 AND 3)
    );

    CREATE INDEX IX_Feedback_CreatedAt ON Feedback(CreatedAt);
END
