-- ============================================================
-- ÜRÜN BAZLI KDV ORANI
--
-- Eskiden e-Arşiv faturası TEK bir genel oranla (AppSettings.EArsivVatRate,
-- varsayılan %10) kesiliyordu — siparişin TÜM tutarına aynı oran uygulanıyordu.
-- Türkiye'de gerçek KDV oranları üründen ürüne değişir (ör. bazı gıda %1,
-- çoğu yeme-içme %10, alkollü içecek/bazı ürünler %20 olabilir) — tek bir
-- sabit oranla kesmek yanlış tutarda fatura üretir.
--
-- Products.VatRate NULL BIRAKILABİLİR: dolu değilse controllers/
-- invoiceController.js AppSettings.EArsivVatRate'i (varsayılan %10) kullanır.
-- Yani mevcut ürünlerin hiçbiri bu migration'la aniden farklı bir orana
-- geçmez — davranış değişmeden, İSTEĞE BAĞLI bir geçersiz kılma eklenir.
--
-- Idempotent: sütun zaten varsa hiçbir şey yapılmaz.
-- NOT: GO KULLANILMAZ — scripts/migrate.js dosyayı tek toplu iş olarak
-- gönderir ve GO ayırıcısını çözmez.
--
-- DİKKAT — AYNI BATCH'TE SÜTUN EKLEYİP HEMEN REFERANS VERMEK: 'ALTER TABLE
-- ADD VatRate' ile onu kullanan 'ALTER TABLE ADD CONSTRAINT ... CHECK
-- (VatRate ...)' AYNI toplu işte olursa, CHECK ifadesi DERLEME ANINDA
-- bağlanmaya çalışılır — sütun o an henüz metadata'ya işlenmemiş olabilir ve
-- "Invalid column name 'VatRate'" hatası alınır (GO ile ayrı batch'lere
-- bölünseydi sorun olmazdı, ama migrate.js GO'yu çözmüyor). Bu yüzden CHECK
-- kısıtı da (2026_08_08_kitchen_role.sql'deki DROP CONSTRAINT gibi) dinamik
-- SQL içinde, ÇALIŞMA ANINDA bağlanacak şekilde ekleniyor.
-- ============================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Products') AND name = 'VatRate'
)
BEGIN
    ALTER TABLE Products ADD VatRate DECIMAL(5,2) NULL;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Products_VatRate' AND parent_object_id = OBJECT_ID('Products')
)
BEGIN
    EXEC sp_executesql N'ALTER TABLE Products ADD CONSTRAINT CK_Products_VatRate
        CHECK (VatRate IS NULL OR (VatRate >= 0 AND VatRate <= 100))';
END
