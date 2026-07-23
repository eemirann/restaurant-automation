-- Kalem bazlı (ürün ürün) ödeme takibi için: bir ödemenin hangi sipariş
-- kalemini (OrderDetailsId) ne kadarlık adetle karşıladığını kalıcı olarak saklar.
-- Böylece "bu üründen kaç adet zaten ödendi" backend'de gerçek bir veriye dayanır,
-- sadece frontend'in o anki seçimine değil.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'PaymentItems')
BEGIN
    CREATE TABLE PaymentItems (
        PaymentItemId INT IDENTITY(1,1) PRIMARY KEY,
        PaymentsId INT NOT NULL,
        OrderDetailsId INT NOT NULL,
        Quantity INT NOT NULL,
        CONSTRAINT FK_PaymentItems_Payments FOREIGN KEY (PaymentsId) REFERENCES Payments(PaymentsId),
        CONSTRAINT FK_PaymentItems_OrderDetails FOREIGN KEY (OrderDetailsId) REFERENCES OrderDetails(OrderDetailsId),
        CONSTRAINT CK_PaymentItems_Quantity CHECK (Quantity > 0)
    );
END
