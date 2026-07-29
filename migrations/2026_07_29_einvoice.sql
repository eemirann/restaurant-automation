-- ============================================================
-- E-ARŞİV FATURA (YER TUTUCU / MOCK ALTYAPI)
--
-- Henüz gerçek bir entegratör (Foriba, Uyumsoft, Nesbilgi, QNB eFinans vb.)
-- seçilmedi. Bu tablo ve alanlar, ileride gerçek bir e-Arşiv sağlayıcısına
-- geçildiğinde veri modelinin değişmemesi için şimdiden kuruluyor —
-- utils/invoiceProvider.js içindeki issueEArsivInvoice fonksiyonu şu an
-- sahte bir fatura numarası üretiyor (mock), gerçek API bağlanınca sadece
-- o fonksiyonun içi değişecek.
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Invoices')
BEGIN
    CREATE TABLE Invoices (
        InvoicesId INT IDENTITY(1,1) PRIMARY KEY,
        OrderId INT NOT NULL FOREIGN KEY REFERENCES Orders(OrderId),
        Type NVARCHAR(20) NOT NULL DEFAULT 'EArsiv', -- ileride 'EFatura' da olabilir (mükellef karşı taraf)
        Status NVARCHAR(20) NOT NULL DEFAULT 'Pending', -- Pending | Issued | Failed
        InvoiceNumber NVARCHAR(50) NULL,
        CustomerName NVARCHAR(150) NULL,
        CustomerTckn NVARCHAR(11) NULL,
        CustomerEmail NVARCHAR(150) NULL,
        Amount DECIMAL(10,2) NOT NULL,
        TaxAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
        PdfUrl NVARCHAR(500) NULL,
        ProviderResponse NVARCHAR(MAX) NULL,
        ErrorMessage NVARCHAR(500) NULL,
        CreatedBy INT NULL FOREIGN KEY REFERENCES Users(UserId),
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        IssuedAt DATETIME NULL
    );

    CREATE INDEX IX_Invoices_OrderId ON Invoices(OrderId);
END

-- Restoranın e-Arşiv fişlerinde kullanacağı KDV oranı (yeme-içme genelde %10,
-- ama işletmeye göre değişebildiği için ayarlardan düzenlenebilir olmalı).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('AppSettings') AND name = 'EArsivVatRate')
BEGIN
    ALTER TABLE AppSettings ADD EArsivVatRate DECIMAL(5,2) NOT NULL
        CONSTRAINT DF_AppSettings_EArsivVatRate DEFAULT 10.00;
END
