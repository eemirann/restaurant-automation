-- ============================================================
-- MUTFAK (KITCHEN) ROLÜ
--
-- Users.Role CHECK kısıtlamasına 'Kitchen' eklenir. Mutfak personeli
-- sadece vardiya başlat/kapat yapar (kasa miktarı girmez) ve giriş
-- yapınca mutfak fiş ekranını (KDS) görür — bkz. controllers/userController.js
-- VALID_ROLES ve restoran-panel/src tarafındaki rol bazlı arayüz.
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Users_Role')
BEGIN
    ALTER TABLE Users DROP CONSTRAINT CK_Users_Role;
END

ALTER TABLE Users ADD CONSTRAINT CK_Users_Role
    CHECK (Role IN ('Waiter', 'Cashier', 'Admin', 'Kitchen'));
