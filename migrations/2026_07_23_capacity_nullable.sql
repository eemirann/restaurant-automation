-- Kapasite artık zorunlu değil: masa oluşturulurken/düzenlenirken boş bırakılabilsin.
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('Tables') AND name = 'Capacity' AND is_nullable = 0
)
BEGIN
    ALTER TABLE Tables ALTER COLUMN Capacity INT NULL;
END
