-- PIN ile giriş için personel PIN hash'i (bcrypt). Şifre yerine günlük kullanım bu alan üzerinden.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'PinHash')
BEGIN
    ALTER TABLE Users ADD PinHash NVARCHAR(255) NULL;
END
