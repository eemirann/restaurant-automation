-- Kapasite artık zorunlu değil: masa oluşturulurken/düzenlenirken boş bırakılabilsin.
ALTER TABLE Tables ALTER COLUMN Capacity INT NULL;
