-- ============================================================
-- MUTFAK (Kitchen) ROLÜ
--
-- Users.Role için CHECK kısıtı ('Waiter', 'Cashier', 'Admin') ile
-- sabitlenmişti (bkz. 2026_07_22_base_schema.sql). Mutfak personeli
-- için 4. rol ekleniyor: 'Kitchen'.
--
-- Kitchen rolü panelde YALNIZCA Mutfak (KDS) ekranını görür
-- (bkz. restoran-panel/src/components/ProtectedRoute.jsx).
--
-- !!! KISIT ADINA GÜVENİLMEZ !!!
-- Bu migration'ın ilk hâli yalnızca 'CK_Users_Role' ADLI kısıtı arayıp
-- düşürüyordu. Ama kısıt her veritabanında bu adı taşımıyor: sütun içi
-- (inline) CHECK olarak oluşturulmuş kurulumlarda SQL Server otomatik ad
-- veriyor (ör. CK__Users__Role__5AEE82B9). Böyle bir veritabanında eski
-- kısıt DÜŞÜRÜLMÜYOR, üstüne yenisi ekleniyor ve iki kısıt AND'lendiği
-- için Kitchen rolü YİNE reddediliyordu — üstelik sessizce: 'CK_Users_Role'
-- sorgulandığında Kitchen görünüyor, ama INSERT 547 hatasıyla düşüyordu.
--
-- Bu yüzden artık AD'a değil TANIMA bakılıyor: Users üzerinde 'Waiter'
-- geçen ama 'Kitchen' geçmeyen HER CHECK kısıtı, adı ne olursa olsun
-- düşürülüyor.
--
-- Idempotent: doğru kısıt zaten varsa hiçbir şey yapılmaz. Tekrar tekrar
-- çalıştırılabilir; hatalı durumdaki veritabanlarını da onarır.
--
-- NOT: Bu dosyada GO KULLANILMAZ — scripts/migrate.js tüm dosyayı tek
-- toplu iş olarak gönderir ve GO ayırıcısını çözmez.
-- ============================================================

-- ---------- 1) Kitchen'a izin vermeyen TÜM Role kısıtlarını düşür ----------
-- Ad bilinmediği için dinamik SQL şart. Filtre 'Waiter' üzerinden yapılır:
-- Role kısıtlarının hepsi bu değeri içerir, başka sütunların kısıtları içermez.
-- (definition LIKE '%[Role]%' YAZILMAZ — T-SQL'de köşeli parantez karakter
-- sınıfıdır ve 'R','o','l','e' harflerinden birini eşler, istediğimiz bu değil.)
DECLARE @kisitAdi SYSNAME;
DECLARE @komut NVARCHAR(MAX);

DECLARE kisit_imleci CURSOR LOCAL FAST_FORWARD FOR
    SELECT name
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('Users')
      AND definition LIKE '%Waiter%'
      AND definition NOT LIKE '%Kitchen%';

OPEN kisit_imleci;
FETCH NEXT FROM kisit_imleci INTO @kisitAdi;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @komut = N'ALTER TABLE Users DROP CONSTRAINT ' + QUOTENAME(@kisitAdi);
    EXEC sp_executesql @komut;
    FETCH NEXT FROM kisit_imleci INTO @kisitAdi;
END

CLOSE kisit_imleci;
DEALLOCATE kisit_imleci;

-- ---------- 2) Doğru kısıtı ekle (yoksa) ----------
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Users_Role' AND parent_object_id = OBJECT_ID('Users')
)
BEGIN
    ALTER TABLE Users ADD CONSTRAINT CK_Users_Role
        CHECK (Role IN ('Waiter', 'Cashier', 'Admin', 'Kitchen'));
END
