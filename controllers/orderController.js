const { sql, connectDB } = require('../config/db');

async function createOrder(req, res) {
    const { TableId, UserId, Items, Note } = req.body;

    if (!TableId || !UserId || !Items  || Items.length === 0) {
        return res.status(400).json({ error: 'Masa, kullanıcı ve an az bir ürün zorunludur'});
    }

    for (const item of Items) {
        if (typeof item.ProductId !== 'number'|| !Number.isInteger(item.Quantity) || item.Quantity <= 0 || typeof item.UnitPrice !== 'number' || item.UnitPrice <= 0) {
            return res.status(400).json({ error: 'Her ürün için geçererli değer giriniz'});
        }
    }

    let pool;               //consttan lete geçtim try bloğu dışında değişken atıyorum)
    try {
        pool = await connectDB();
    } catch (err) {
        console.error('Veritabanına bağlanılamadı', err);
        return res.status(500).json({ error: 'Veritabanı bağlantı hatası'});
    }

    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        let totalAmount = 0;             
        Items.forEach(item => {
            totalAmount += item.Quantity * item.UnitPrice;             //total amount girmiyoruz hesaplıyoruz
        });

        const orderResult = await new sql.Request(transaction)
    .input('TableId', sql.Int, TableId)
    .input('UserId', sql.Int, UserId)
    .input('TotalAmount', sql.Decimal(10, 2), totalAmount)
    .input('Note', sql.NVarChar, Note || null)
    .query(`DECLARE @InsertedOrders TABLE (
            Id INT, TableId INT, UserId INT, TotalAmount DECIMAL(10,2),
            Status NVARCHAR(50), Note NVARCHAR(MAX), CreatedAt DATETIME
        );
        INSERT INTO Orders (TableId, UserId, TotalAmount, Note)
        OUTPUT 
            INSERTED.Id, INSERTED.TableId, INSERTED.UserId, 
            INSERTED.TotalAmount, INSERTED.Status, 
            INSERTED.Note, INSERTED.CreatedAt
        INTO @InsertedOrders (Id, TableId, UserId, TotalAmount, Status, Note, CreatedAt)
        VALUES (@TableId, @UserId, @TotalAmount, @Note);
        SELECT * FROM @InsertedOrders;`);

const newOrderId = orderResult.recordset[0].Id;

        for(const item of Items) {
            await new sql.Request(transaction)
                .input('OrderId', sql.Int, newOrderId)
                .input('ProductId', sql.Int, item.ProductId)
                .input('Quantity', sql. Int, item.Quantity)
                .input('UnitPrice', sql.Decimal(10,2), item.UnitPrice)
                .input('VariantId', sql.Int, item.VariantId || null)
                .input('Note', sql.NVarChar, item.Note || null)
                .query('INSERT INTO OrderDetails (OrderId, ProductId, Quantity, UnitPrice, VariantId, Note) VALUES (@OrderId, @ProductId, @Quantity, @UnitPrice, @VariantId, @Note)');
        }

        await transaction.commit();

        res.status(201).json({
            message: 'Sipariş başarıyla oluşturuldu.',
            order: orderResult.recordset[0],
            totalAmount: totalAmount
        });

    } catch (err) {
    try {
        await transaction.rollback();
    } catch (rollbackErr) {
        console.error('Rollback sırasında ek hata (muhtemelen zaten abort olmuş):', rollbackErr.message);
    }
    console.error('Sipariş oluşturulurken asıl hata:', err);
    res.status(500).json({ error: 'Sipariş oluşturulamadı' });
}

}

module.exports = { createOrder };