-- ============================================================
-- ŞURUP "PORSİYON BAŞINA TÜKETİM" (adet/ml karışıklığını çözer)
--
-- Sorun: Siparişte şurup "adet" (pompa/porsiyon) olarak seçiliyor (ör. "1
-- pompa karamel"), ama stok genelde ml olarak tutuluyor (ör. 750 ml'lik
-- şişe). Quantity=1 girilince stoktan da SADECE 1 ml düşüyordu — oysa 1
-- pompa gerçekte ~15-20 ml'ye denk gelir. Personel "adet" girdiğini
-- sanıyor, sistem "ml" düşüyordu.
--
-- Çözüm: Products.ServingSize — "1 porsiyon kaç stok birimi (ml) tüketir".
-- NULL ise ESKİ DAVRANIŞ aynen korunur (1 porsiyon = 1 stok birimi),
-- böylece zaten doğru şekilde stok girmiş kurulumlar etkilenmez. Sadece
-- açıkça set edilen şuruplarda devreye girer (bkz. controllers/
-- syrupController.js, utils/orderBuilder.js, controllers/orderController.js).
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'ServingSize')
BEGIN
    ALTER TABLE Products ADD ServingSize DECIMAL(10,3) NULL;
END
