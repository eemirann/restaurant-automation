const { sql, connectDB } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { getUnitIds, upsertServingSize } = require('../utils/servingSize');
const { setProductStockUnit } = require('../utils/stockUnit');

// Ürün Türü -> Kategori adı eşlemesi (Şurup/Ekstra sayfaları kaldırıldı,
// oluşturma artık buradan; syrupController/extraController.createXxx ile
// AYNI kategori isimlerini kullanır — kategori seed verisi ortak).
const TYPE_CATEGORY_NAME = { syrup: 'Şurup', extra: 'Ekstra', raw: 'Hammadde' };

// ============================================================
// BİR ÜRÜNÜN STOK DURUMU (varsa) — ProductModal.jsx'teki "Stok Takibi"
// düğmesi için. Menü ürünleri VARSAYILAN OLARAK stokta izlenmez (bkz.
// controllers/productController.js: getAllProducts raw=stockable notu) —
// bu uç, dolapta/hazır bekleyen (soğuk içecek gibi) belirli bir ürünü
// İSTEĞE BAĞLI olarak stoğa bağlamak/durumunu görmek için var.
// ============================================================
async function getStockByProduct(req, res) {
    try {
        const { productId } = req.params;
        const pool = await connectDB();
        const result = await pool.request()
            .input('ProductId', sql.Int, productId)
            .query(`
                SELECT s.StockId, s.ProductId, s.Quantity, s.MinStockLevel, s.IsTracked,
                       p.StockUnitId, u.Code AS StockUnitCode, p.Cost
                FROM Stock s
                JOIN Products p ON p.ProductId = s.ProductId
                LEFT JOIN Units u ON u.UnitId = p.StockUnitId
                WHERE s.ProductId = @ProductId
            `);

        if (result.recordset.length === 0) {
            return res.status(200).json(null);
        }
        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Ürünün stok durumu getirilirken hata:', err);
        res.status(500).json({ error: 'Stok durumu getirilemedi' });
    }
}

// ============================================================
// TÜM STOK KALEMLERİNİ LİSTELE (ürün adıyla birlikte)
// ============================================================
async function getAllStock(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT s.StockId, s.ProductId, p.Name AS ProductName,
                   s.Quantity, s.MinStockLevel, s.IsTracked, s.UpdatedAt,
                   p.IsSyrup, p.IsExtra, p.Price, p.Cost,
                   p.StockUnitId, u.Code AS StockUnitCode
            FROM Stock s
            JOIN Products p ON p.ProductId = s.ProductId
            LEFT JOIN Units u ON u.UnitId = p.StockUnitId
            ORDER BY p.Name ASC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Stok listesi getirilirken hata:', err);
        res.status(500).json({ error: 'Stok listesi getirilemedi' });
    }
}

// ============================================================
// YENİ STOK KALEMİ EKLE (SADECE ADMIN)
// Bir ürün için sadece tek bir stok kaydı olabilir (ProductId unique).
//
// İki şekilde ürün belirtilebilir:
//  - ProductId: menüde zaten var olan bir ürün seçilir
//  - ProductName: menüde olmayan, sadece envanter için yeni bir "hammadde"
//    adı yazılır — aynı isimde hammadde varsa o kullanılır, yoksa otomatik
//    oluşturulur (IsRawMaterial=1, "Hammadde" kategorisi altında, menüde
//    hiç görünmez).
//
// Quantity > 0 girildiyse, bu ilk adet de bir "alım" olarak StockPurchases +
// StockMovements'a (IN) kaydedilir (UnitPrice/Supplier/InvoiceNumber/Notes opsiyonel).
// ============================================================
async function createStockItem(req, res) {
    try {
        const { ProductId, ProductName, Quantity, MinStockLevel, UnitPrice, Supplier, InvoiceNumber, Notes, Type, Price, ServingSize, StockUnitId, ConversionTargetUnitId, ConversionFactor, Cost } = req.body;

        if (!ProductId && !ProductName) {
            return res.status(400).json({ error: 'Ürün seçmeli veya yeni ürün adı girmelisiniz' });
        }

        const qty = Quantity || 0;
        const minLevel = MinStockLevel || 0;

        if (qty < 0 || minLevel < 0) {
            return res.status(400).json({ error: 'Adet ve minimum stok negatif olamaz' });
        }

        // Tür: 'raw' (varsayılan, hammadde) | 'syrup' | 'extra'. Şurup/Ekstra
        // sayfaları kaldırıldı — yeni bir şurup/ekstra artık DOĞRUDAN burada,
        // tek formdan açılır (bkz. syrupController.createSyrup/extraController.createExtra
        // ile aynı kategori/flag mantığı, kod tekrarı olmasın diye TYPE_CATEGORY_NAME +
        // utils/servingSize.js paylaşılıyor).
        const type = Type || 'raw';
        if (!['raw', 'syrup', 'extra'].includes(type)) {
            return res.status(400).json({ error: 'Geçersiz ürün türü' });
        }
        if (type !== 'raw' && (typeof Price !== 'number' || Price < 0)) {
            return res.status(400).json({ error: 'Şurup/Ekstra için negatif olmayan bir Fiyat girilmelidir' });
        }
        if (ServingSize !== undefined && ServingSize !== null && (typeof ServingSize !== 'number' || ServingSize <= 0)) {
            return res.status(400).json({ error: 'Porsiyon başına tüketim (varsa) 0\'dan büyük bir sayı olmalıdır' });
        }
        // Maliyet (Products.Cost) — bu malzemenin satın alma/birim maliyeti.
        // Recipes/Reports/Dashboard'daki kâr hesabı BUNA bağlı (bkz.
        // controllers/reportController.js, controllers/dashboardController.js) —
        // girilmezse o hesaplar "Hesaplanamadı" döner.
        if (Cost !== undefined && Cost !== null && (typeof Cost !== 'number' || Cost < 0)) {
            return res.status(400).json({ error: 'Maliyet negatif olmayan bir sayı olmalıdır' });
        }
        // Stok Birimi — hammaddenin adedinin/kilosunun/litresinin ne anlama
        // geldiğini belirler (bkz. utils/stockUnit.js). Belirtilmemiş "adet"
        // gibi bir birim, reçetede farklı bir birim (ml/g) kullanılırsa
        // stok düşümünün SESSİZCE yanlış hesaplanmasına yol açar.
        if (ConversionTargetUnitId != null && (typeof ConversionFactor !== 'number' || ConversionFactor <= 0)) {
            return res.status(400).json({ error: 'Birim dönüşümü için 0\'dan büyük bir oran girilmelidir' });
        }

        const pool = await connectDB();

        let finalProductId = ProductId;

        // Yeni ürün adı girildiyse: aynı isimde (aynı türde) ürün var mı bak, yoksa oluştur
        if (!finalProductId) {
            const trimmedName = ProductName.trim();
            if (!trimmedName) {
                return res.status(400).json({ error: 'Ürün adı boş olamaz' });
            }

            const existing = await pool.request()
                .input('Name', sql.NVarChar, trimmedName)
                .query(`SELECT ProductId FROM Products WHERE Name = @Name`);

            if (existing.recordset.length > 0) {
                finalProductId = existing.recordset[0].ProductId;
            } else {
                const categoryResult = await pool.request()
                    .input('CategoryName', sql.NVarChar(50), TYPE_CATEGORY_NAME[type])
                    .query(`SELECT TOP 1 CategoryId FROM Categories WHERE Name = @CategoryName`);

                const created = await pool.request()
                    .input('Name', sql.NVarChar, trimmedName)
                    .input('Price', sql.Decimal(10, 2), type === 'raw' ? 0 : Price)
                    .input('CategoryId', sql.Int, categoryResult.recordset[0]?.CategoryId)
                    .input('IsRawMaterial', sql.Bit, type === 'raw' ? 1 : 0)
                    .input('IsSyrup', sql.Bit, type === 'syrup' ? 1 : 0)
                    .input('IsExtra', sql.Bit, type === 'extra' ? 1 : 0)
                    .input('Cost', sql.Decimal(10, 2), Cost ?? null)
                    .query(`
                        INSERT INTO Products (Name, Price, CategoryId, IsRawMaterial, IsSyrup, IsExtra, Cost)
                        OUTPUT INSERTED.ProductId
                        VALUES (@Name, @Price, @CategoryId, @IsRawMaterial, @IsSyrup, @IsExtra, @Cost)
                    `);
                finalProductId = created.recordset[0].ProductId;
            }
        }

        // Var olan bir ürün (ör. daha önce hammadde olarak eklenmiş) seçilip
        // Tür Şurup/Ekstra olarak işaretlendiyse: ürünü de güncelle (bkz.
        // setStockItemType ile aynı amaç, burada ekleme akışının bir parçası).
        if (type !== 'raw') {
            const categoryResult = await pool.request()
                .input('CategoryName', sql.NVarChar(50), TYPE_CATEGORY_NAME[type])
                .query(`SELECT TOP 1 CategoryId FROM Categories WHERE Name = @CategoryName`);
            await pool.request()
                .input('ProductId', sql.Int, finalProductId)
                .input('Price', sql.Decimal(10, 2), Price)
                .input('CategoryId', sql.Int, categoryResult.recordset[0]?.CategoryId)
                .input('IsSyrup', sql.Bit, type === 'syrup' ? 1 : 0)
                .input('IsExtra', sql.Bit, type === 'extra' ? 1 : 0)
                .query(`
                    UPDATE Products SET IsSyrup = @IsSyrup, IsExtra = @IsExtra, Price = @Price, CategoryId = @CategoryId
                    WHERE ProductId = @ProductId
                `);

            if (ServingSize !== undefined) {
                await upsertServingSize(pool, finalProductId, ServingSize ?? null, await getUnitIds(pool));
            }
        }

        // Stok Birimi (ör. hammaddeler: "adet"/"kg" gibi satın alma birimi) —
        // reçetede farklı bir birim kullanılıyorsa (ör. "ml") özel dönüşüm de yazılır.
        if (StockUnitId != null) {
            await setProductStockUnit(pool, finalProductId, StockUnitId, ConversionTargetUnitId ?? null, ConversionFactor ?? null);
        }

        // Maliyet — var olan bir ürün seçildiyse (yeni ürün zaten yukarıda Cost
        // ile oluşturuldu) burada da yazılabilsin diye ayrıca güncelleniyor.
        if (Cost !== undefined) {
            await pool.request()
                .input('ProductId', sql.Int, finalProductId)
                .input('Cost', sql.Decimal(10, 2), Cost)
                .query(`UPDATE Products SET Cost = @Cost WHERE ProductId = @ProductId`);
        }

        const result = await pool.request()
            .input('ProductId', sql.Int, finalProductId)
            .input('Quantity', sql.Decimal(10, 3), qty)
            .input('MinStockLevel', sql.Decimal(10, 3), minLevel)
            .query(`
                INSERT INTO Stock (ProductId, Quantity, MinStockLevel, IsTracked)
                OUTPUT INSERTED.*
                VALUES (@ProductId, @Quantity, @MinStockLevel, 1)
            `);

        const newStock = result.recordset[0];

        // İlk adet bir "alım" gibi kaydedilir (fatura/tedarikçi bilgisiyle birlikte)
        if (qty > 0) {
            await pool.request()
                .input('StockId', sql.Int, newStock.StockId)
                .input('Quantity', sql.Decimal(10, 3), qty)
                .input('UnitPrice', sql.Decimal(10, 2), UnitPrice || null)
                .input('Supplier', sql.NVarChar(150), Supplier || null)
                .input('InvoiceNumber', sql.NVarChar(50), InvoiceNumber || null)
                .input('Notes', sql.NVarChar(500), Notes || null)
                .query(`
                    INSERT INTO StockPurchases (StockId, Quantity, UnitPrice, Supplier, InvoiceNumber, Notes)
                    VALUES (@StockId, @Quantity, @UnitPrice, @Supplier, @InvoiceNumber, @Notes)
                `);

            await pool.request()
                .input('StockId', sql.Int, newStock.StockId)
                .input('Quantity', sql.Decimal(10, 3), qty)
                .query(`INSERT INTO StockMovements (StockId, Quantity, MovementType) VALUES (@StockId, @Quantity, 'IN')`);
        }

        res.status(201).json(newStock);
    } catch (err) {
        // Aynı ürün için ikinci bir stok kaydı eklenmeye çalışılırsa (unique kısıtı)
        if (err.number === 2627) {
            return res.status(409).json({ error: 'Bu ürün için zaten bir stok kaydı var' });
        }
        console.error('Stok kalemi eklenirken hata:', err);
        res.status(500).json({ error: 'Stok kalemi eklenemedi' });
    }
}

// ============================================================
// STOK KALEMİNİ DÜZENLE (SADECE ADMIN)
// Adet ve minimum stok seviyesini doğrudan düzeltmek için (ör. sayım sonrası).
// ============================================================
async function updateStockItem(req, res) {
    try {
        const { id } = req.params;
        const { Quantity, MinStockLevel } = req.body;

        if (Quantity === undefined || MinStockLevel === undefined) {
            return res.status(400).json({ error: 'Quantity ve MinStockLevel zorunludur' });
        }

        if (Quantity < 0 || MinStockLevel < 0) {
            return res.status(400).json({ error: 'Adet ve minimum stok negatif olamaz' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Quantity', sql.Decimal(10, 3), Quantity)
            .input('MinStockLevel', sql.Decimal(10, 3), MinStockLevel)
            .query(`
                UPDATE Stock
                SET Quantity = @Quantity, MinStockLevel = @MinStockLevel, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok kalemi güncellenirken hata:', err);
        res.status(500).json({ error: 'Stok kalemi güncellenemedi' });
    }
}

// ============================================================
// STOK KALEMİNİ PASİFLEŞTİR (SADECE ADMIN)
// Diğer tüm varlıklarla (Ürünler, Kategoriler, Kullanıcılar, Ekstralar/
// Şuruplar) aynı soft-delete deseni: hard DELETE yapılmaz, IsTracked=0
// yapılır. Böylece StockMovements/StockPurchases geçmişi (FK ON DELETE
// CASCADE nedeniyle hard delete'te kaybolurdu) korunur. IsTracked=0 olan
// ürünler ayrıca sipariş anında stoktan hiç düşülmez (bkz. utils/stockDeduction.js).
// ============================================================
async function deleteStockItem(req, res) {
    try {
        const { id } = req.params;

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query(`
                UPDATE Stock SET IsTracked = 0, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        logAudit(pool, {
            userId: req.user?.userId, action: 'STOCK_ITEM_DELETE', entityType: 'Stock', entityId: Number(id),
            details: { productId: result.recordset[0].ProductId },
        });

        res.status(200).json({ message: 'Stok kalemi pasifleştirildi.', stock: result.recordset[0] });
    } catch (err) {
        console.error('Stok kalemi pasifleştirilirken hata:', err);
        res.status(500).json({ error: 'Stok kalemi pasifleştirilemedi' });
    }
}

// ============================================================
// STOK KALEMİNİ TEKRAR AKTİFLEŞTİR (SADECE ADMIN)
// ============================================================
async function reactivateStockItem(req, res) {
    try {
        const { id } = req.params;

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query(`
                UPDATE Stock SET IsTracked = 1, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        logAudit(pool, {
            userId: req.user?.userId, action: 'STOCK_ITEM_REACTIVATE', entityType: 'Stock', entityId: Number(id),
            details: { productId: result.recordset[0].ProductId },
        });

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok kalemi aktifleştirilirken hata:', err);
        res.status(500).json({ error: 'Stok kalemi aktifleştirilemedi' });
    }
}

// ============================================================
// STOK ADEDİNİ ARTIR (SADECE ADMIN)
// Body: { amount }
// Her artışta bir "IN" hareket kaydı da oluşturulur (stok geçmişi için).
// Tarih/saat otomatik kaydedilir (StockMovements.MovementDate varsayılanı).
// ============================================================
async function increaseStock(req, res) {
    try {
        const { id } = req.params;
        const amount = req.body.amount ?? 1;

        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'amount pozitif bir sayı olmalıdır' });
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Amount', sql.Decimal(10, 3), amount)
            .query(`
                UPDATE Stock
                SET Quantity = Quantity + @Amount, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        await pool.request()
            .input('StockId', sql.Int, id)
            .input('Quantity', sql.Decimal(10, 3), amount)
            .query(`
                INSERT INTO StockMovements (StockId, Quantity, MovementType)
                VALUES (@StockId, @Quantity, 'IN')
            `);

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok artırılırken hata:', err);
        res.status(500).json({ error: 'Stok artırılamadı' });
    }
}

// ============================================================
// STOK ADEDİNİ AZALT (SADECE ADMIN)
// Body: { amount }
// Stok 0'ın altına düşemez. Her azalışta bir "OUT" hareket kaydı oluşturulur.
// ============================================================
async function decreaseStock(req, res) {
    try {
        const { id } = req.params;
        const amount = req.body.amount ?? 1;

        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'amount pozitif bir sayı olmalıdır' });
        }

        const pool = await connectDB();

        const current = await pool.request()
            .input('Id', sql.Int, id)
            .query('SELECT Quantity FROM Stock WHERE StockId = @Id');

        if (current.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        if (current.recordset[0].Quantity < amount) {
            return res.status(400).json({ error: 'Stok miktarı 0\'ın altına düşürülemez' });
        }

        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Amount', sql.Decimal(10, 3), amount)
            .query(`
                UPDATE Stock
                SET Quantity = Quantity - @Amount, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        await pool.request()
            .input('StockId', sql.Int, id)
            .input('Quantity', sql.Decimal(10, 3), amount)
            .query(`
                INSERT INTO StockMovements (StockId, Quantity, MovementType)
                VALUES (@StockId, @Quantity, 'OUT')
            `);

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok azaltılırken hata:', err);
        res.status(500).json({ error: 'Stok azaltılamadı' });
    }
}

// ============================================================
// TÜM STOK HAREKETLERİNİ LİSTELE (ürün adıyla birlikte, en yeni önce)
// ============================================================
async function getAllStockMovements(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT sm.StockMovementId, sm.StockId, p.Name AS ProductName,
                   sm.Quantity, sm.MovementType, sm.MovementDate
            FROM StockMovements sm
            JOIN Stock s ON s.StockId = sm.StockId
            JOIN Products p ON p.ProductId = s.ProductId
            ORDER BY sm.MovementDate DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Stok hareketleri getirilirken hata:', err);
        res.status(500).json({ error: 'Stok hareketleri getirilemedi' });
    }
}

// ============================================================
// STOK ALIMI KAYDET (SADECE ADMIN)
// "+" butonundaki sağdan kayan çekmece bunu çağırır.
// Body: { Quantity, UnitPrice?, Supplier?, InvoiceNumber?, Notes? }
// Stok adedini artırır + StockPurchases'a kaydeder + StockMovements'a "IN" hareketi düşer.
// ============================================================
async function recordStockPurchase(req, res) {
    try {
        const { id } = req.params;
        const { Quantity, UnitPrice, Supplier, InvoiceNumber, Notes } = req.body;

        if (typeof Quantity !== 'number' || Quantity <= 0) {
            return res.status(400).json({ error: 'Quantity pozitif bir sayı olmalıdır' });
        }

        const pool = await connectDB();

        const stockResult = await pool.request()
            .input('Id', sql.Int, id)
            .input('Amount', sql.Decimal(10, 3), Quantity)
            .query(`
                UPDATE Stock
                SET Quantity = Quantity + @Amount, UpdatedAt = GETDATE()
                OUTPUT INSERTED.*
                WHERE StockId = @Id
            `);

        if (stockResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }

        await pool.request()
            .input('StockId', sql.Int, id)
            .input('Quantity', sql.Decimal(10, 3), Quantity)
            .input('UnitPrice', sql.Decimal(10, 2), UnitPrice || null)
            .input('Supplier', sql.NVarChar(150), Supplier || null)
            .input('InvoiceNumber', sql.NVarChar(50), InvoiceNumber || null)
            .input('Notes', sql.NVarChar(500), Notes || null)
            .query(`
                INSERT INTO StockPurchases (StockId, Quantity, UnitPrice, Supplier, InvoiceNumber, Notes)
                VALUES (@StockId, @Quantity, @UnitPrice, @Supplier, @InvoiceNumber, @Notes)
            `);

        await pool.request()
            .input('StockId', sql.Int, id)
            .input('Quantity', sql.Decimal(10, 3), Quantity)
            .query(`
                INSERT INTO StockMovements (StockId, Quantity, MovementType)
                VALUES (@StockId, @Quantity, 'IN')
            `);

        res.status(201).json(stockResult.recordset[0]);
    } catch (err) {
        console.error('Stok alımı kaydedilirken hata:', err);
        res.status(500).json({ error: 'Stok alımı kaydedilemedi' });
    }
}

// ============================================================
// STOK KALEMİNİ ŞURUP/EKSTRA OLARAK İŞARETLE (SADECE ADMIN)
// Stok sayfasından, ürünün kendisini (Products.IsSyrup/IsExtra) değiştirir
// — Şuruplar/Ekstralar sayfasından AYRI bir kayıt AÇMAZ, aynı stok kaydına
// bağlı ürün doğrudan güncellenir (bkz. syrupController.createSyrup'taki
// "var olanı bağla" mantığıyla aynı amaç, burada tersinden: zaten stoğu
// olan bir ürünü şurup/ekstra yapmak).
// Body: { IsSyrup, IsExtra, Price } — Price, en az biri açılıyorsa (ekstra
// ücret için) zorunludur.
// ============================================================
async function setStockItemType(req, res) {
    try {
        const { id } = req.params;
        const { IsSyrup, IsExtra, Price } = req.body;

        if (typeof IsSyrup !== 'boolean' || typeof IsExtra !== 'boolean') {
            return res.status(400).json({ error: 'IsSyrup ve IsExtra boolean olmalıdır' });
        }
        if ((IsSyrup || IsExtra) && (typeof Price !== 'number' || Price < 0)) {
            return res.status(400).json({ error: 'Şurup/Ekstra olarak işaretlerken negatif olmayan bir Fiyat girilmelidir' });
        }

        const pool = await connectDB();

        const stockResult = await pool.request()
            .input('StockId', sql.Int, id)
            .query(`SELECT ProductId FROM Stock WHERE StockId = @StockId`);

        if (stockResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }
        const productId = stockResult.recordset[0].ProductId;

        // Açılan bayrağa göre uygun kategoriye taşınır (Şurup > Ekstra
        // önceliğiyle — ikisi birden açıksa Şurup kategorisi kullanılır).
        // İkisi de kapatılıyorsa kategori DOKUNULMAZ (Hammadde'ye zorla
        // geri atmak, kullanıcının elle seçtiği başka bir kategoriyi bozabilir).
        let categoryId = null;
        if (IsSyrup || IsExtra) {
            const categoryName = IsSyrup ? 'Şurup' : 'Ekstra';
            const categoryResult = await pool.request()
                .input('CategoryName', sql.NVarChar(50), categoryName)
                .query(`SELECT TOP 1 CategoryId FROM Categories WHERE Name = @CategoryName`);
            if (categoryResult.recordset.length === 0) {
                return res.status(500).json({ error: `"${categoryName}" kategorisi bulunamadı, migration çalıştırılmamış olabilir` });
            }
            categoryId = categoryResult.recordset[0].CategoryId;
        }

        const request = pool.request()
            .input('ProductId', sql.Int, productId)
            .input('IsSyrup', sql.Bit, IsSyrup ? 1 : 0)
            .input('IsExtra', sql.Bit, IsExtra ? 1 : 0);

        let setClause = 'IsSyrup = @IsSyrup, IsExtra = @IsExtra';
        if (IsSyrup || IsExtra) {
            request.input('Price', sql.Decimal(10, 2), Price);
            request.input('CategoryId', sql.Int, categoryId);
            setClause += ', Price = @Price, CategoryId = @CategoryId';
        }

        const result = await request.query(`
            UPDATE Products SET ${setClause}
            OUTPUT INSERTED.ProductId, INSERTED.Name, INSERTED.IsSyrup, INSERTED.IsExtra, INSERTED.Price
            WHERE ProductId = @ProductId
        `);

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok kalemi türü güncellenirken hata:', err);
        res.status(500).json({ error: 'Stok kalemi türü güncellenemedi' });
    }
}

// ============================================================
// STOK BİRİMİNİ AYARLA/DÜZELT (SADECE ADMIN)
// Zaten var olan bir stok kaydının Stok Birimini (Products.StockUnitId) ve —
// gerekiyorsa — reçetelerde kullanılan birimle arasındaki özel dönüşümü
// (ProductUnitConversions) sonradan ayarlamak/düzeltmek için (bkz.
// utils/stockUnit.js). Ör: "Süt" hammaddesi "1 adet" ile eklenmiş ama
// reçete "ml" kullanıyorsa, buradan "1 adet = 1000 ml" tanımlanır.
// Body: { StockUnitId, ConversionTargetUnitId?, ConversionFactor? }
// ============================================================
async function setStockItemUnit(req, res) {
    try {
        const { id } = req.params;
        const { StockUnitId, ConversionTargetUnitId, ConversionFactor } = req.body;

        if (typeof StockUnitId !== 'number') {
            return res.status(400).json({ error: 'StockUnitId zorunludur' });
        }
        if (ConversionTargetUnitId != null && (typeof ConversionFactor !== 'number' || ConversionFactor <= 0)) {
            return res.status(400).json({ error: 'Birim dönüşümü için 0\'dan büyük bir oran girilmelidir' });
        }

        const pool = await connectDB();

        const stockResult = await pool.request()
            .input('StockId', sql.Int, id)
            .query(`SELECT ProductId FROM Stock WHERE StockId = @StockId`);

        if (stockResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }
        const productId = stockResult.recordset[0].ProductId;

        await setProductStockUnit(pool, productId, StockUnitId, ConversionTargetUnitId ?? null, ConversionFactor ?? null);

        const result = await pool.request()
            .input('ProductId', sql.Int, productId)
            .query(`
                SELECT p.ProductId, p.Name, p.StockUnitId, u.Code AS StockUnitCode
                FROM Products p
                LEFT JOIN Units u ON u.UnitId = p.StockUnitId
                WHERE p.ProductId = @ProductId
            `);

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok birimi güncellenirken hata:', err);
        res.status(500).json({ error: 'Stok birimi güncellenemedi' });
    }
}

// ============================================================
// MALİYETİ AYARLA/DÜZELT (SADECE ADMIN)
// Products.Cost — bu malzemenin satın alma/birim maliyeti. Recipes/Reports/
// Dashboard'daki kâr hesabı BUNA bağlı (bkz. controllers/reportController.js,
// controllers/dashboardController.js): reçetedeki hammaddelerden biri bile
// Cost'suz kalırsa o ürünün maliyeti/kârı "Hesaplanamadı" döner.
// Body: { Cost } — null gönderilirse maliyet temizlenir (tekrar "girilmemiş" olur).
// ============================================================
async function setStockItemCost(req, res) {
    try {
        const { id } = req.params;
        const { Cost } = req.body;

        if (Cost !== null && (typeof Cost !== 'number' || Cost < 0)) {
            return res.status(400).json({ error: 'Maliyet negatif olmayan bir sayı olmalıdır (temizlemek için null gönderin)' });
        }

        const pool = await connectDB();

        const stockResult = await pool.request()
            .input('StockId', sql.Int, id)
            .query(`SELECT ProductId FROM Stock WHERE StockId = @StockId`);

        if (stockResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Stok kalemi bulunamadı' });
        }
        const productId = stockResult.recordset[0].ProductId;

        const result = await pool.request()
            .input('ProductId', sql.Int, productId)
            .input('Cost', sql.Decimal(10, 2), Cost)
            .query(`
                UPDATE Products SET Cost = @Cost
                OUTPUT INSERTED.ProductId, INSERTED.Name, INSERTED.Cost
                WHERE ProductId = @ProductId
            `);

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Stok maliyeti güncellenirken hata:', err);
        res.status(500).json({ error: 'Stok maliyeti güncellenemedi' });
    }
}

module.exports = {
    getStockByProduct,
    getAllStock,
    createStockItem,
    updateStockItem,
    deleteStockItem,
    reactivateStockItem,
    increaseStock,
    decreaseStock,
    getAllStockMovements,
    recordStockPurchase,
    setStockItemType,
    setStockItemUnit,
    setStockItemCost
};
