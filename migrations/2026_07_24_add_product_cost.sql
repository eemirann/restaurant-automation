-- Dashboard'daki "kâr oranı" hesaplaması için ürünlere manuel girilen birim maliyet.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'Cost')
BEGIN
    ALTER TABLE Products ADD Cost DECIMAL(10, 2) NULL;
END
