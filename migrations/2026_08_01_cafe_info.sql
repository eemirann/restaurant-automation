-- ============================================================
-- KAFE BİLGİ NOTU + SOSYAL MEDYA + İLETİŞİM (müşteri QR menüsü sol panel)
--
-- musteri-menu'deki sol bilgi paneli için: isim altında küçük bir not,
-- sosyal medya linkleri ve iletişim bilgisi. Hepsi AppSettings üzerinde
-- (tek satırlık, restoran genelinde ortak ayar tablosu) — GET /api/settings
-- zaten kimlik doğrulamasız (public) olduğu için musteri-menu bunu
-- doğrudan okuyabiliyor, ayrı bir uç gerekmedi.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'CafeNote')
BEGIN
    ALTER TABLE AppSettings ADD CafeNote NVARCHAR(300) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'SocialInstagram')
BEGIN
    ALTER TABLE AppSettings ADD SocialInstagram NVARCHAR(200) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'SocialFacebook')
BEGIN
    ALTER TABLE AppSettings ADD SocialFacebook NVARCHAR(200) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'SocialX')
BEGIN
    ALTER TABLE AppSettings ADD SocialX NVARCHAR(200) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'SocialWhatsapp')
BEGIN
    ALTER TABLE AppSettings ADD SocialWhatsapp NVARCHAR(30) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'ContactPhone')
BEGIN
    ALTER TABLE AppSettings ADD ContactPhone NVARCHAR(30) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'ContactAddress')
BEGIN
    ALTER TABLE AppSettings ADD ContactAddress NVARCHAR(300) NULL;
END
