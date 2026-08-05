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
-- Idempotent: kısıt zaten Kitchen'ı içeriyorsa hiçbir şey yapılmaz.
-- NOT: Bu dosyada GO KULLANILMAZ — scripts/migrate.js tüm dosyayı tek
-- toplu iş olarak gönderir ve GO ayırıcısını çözmez.
-- ============================================================
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Users_Role'
      AND parent_object_id = OBJECT_ID('Users')
      AND definition NOT LIKE '%Kitchen%'
)
BEGIN
    ALTER TABLE Users DROP CONSTRAINT CK_Users_Role;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Users_Role' AND parent_object_id = OBJECT_ID('Users')
)
BEGIN
    ALTER TABLE Users ADD CONSTRAINT CK_Users_Role
        CHECK (Role IN ('Waiter', 'Cashier', 'Admin', 'Kitchen'));
END
