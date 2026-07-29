-- ============================================================
-- MASA BÖLÜMLERİ (Salon/Teras/Bahçe/VIP/Bar gibi) — ADMİN TARAFINDAN
-- EKLENİP/ÇIKARILIP/YENİDEN ADLANDIRILABİLİR HALE GETİRİLİYOR.
--
-- Önceden Tables.Area sabit bir CHECK kısıtıyla ('Salon','Terrace',
-- 'Garden','VIP','Bar') sınırlıydı ve panel tarafında da hardcoded bir
-- liste vardı (Tables.jsx: AREAS). Artık bu liste TableAreas tablosunda
-- tutuluyor, Categories/Extras ile aynı desen (soft-delete: IsActive).
--
-- Tables.Area kolonu (NVARCHAR(20)) DEĞİŞMİYOR — hâlâ düz metin, sadece
-- artık hangi metinlerin geçerli olduğu bu tablodan geliyor. Bir bölüm
-- yeniden adlandırılınca (bkz. controllers/tableAreaController.js:
-- updateArea) Tables.Area'daki eski isimler de aynı transaction'da
-- yeni isme güncellenir, veri kaybı/uyumsuzluk olmaz.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TableAreas')
BEGIN
    CREATE TABLE TableAreas (
        AreaId INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(30) NOT NULL UNIQUE,
        DisplayOrder INT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1
    );

    -- Mevcut masalarda halihazırda kullanılan 5 değerle birebir aynı
    -- (İngilizce anahtarlar) — böylece hiçbir masa "yetim" kalmaz.
    -- Panel tarafında bu anahtarlar için Türkçe çeviri (Tables.jsx:
    -- areaLabelOf) korunuyor; admin yeni bir bölüm eklerse doğrudan
    -- yazdığı isim (ör. "Kış Bahçesi") aynen gösterilir.
    INSERT INTO TableAreas (Name, DisplayOrder) VALUES
        ('Salon', 1), ('Terrace', 2), ('Garden', 3), ('VIP', 4), ('Bar', 5);
END

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Tables_Area')
BEGIN
    ALTER TABLE Tables DROP CONSTRAINT CK_Tables_Area;
END
