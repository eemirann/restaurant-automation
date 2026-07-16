const { sql, connectDB } = require('../config/db');

async function createOrder(req, res) {
    const { TableId, UserId, Items, Note } = req.body;

    if (!TableId || !UserId || !Items  || Items.length === 0) {
        return res.status(400).json({ error: 'Masa, kullanıcı ve an az bir ürün zorunludur'});
    }

    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();
                                            //total amount girmiyoruz hesaplıyoruz
        let totalAmount = 0;
        Items.forEach(item => {
            totalAmount += item.Quantity * item.UnitPrice;
        });

        const orderResult = await new sql.Request(transaction)
            .input('TableId', sql.Int, TableId)
            .input('UserId', sql.Int, UserId)
            .input('TotalAmount', sql.Decimal(10,2), totalAmount)
            .input('Note', sql.NVarChar, Note || null)
            .query('INSERT INTO Orders (TableId, UserId, TotalAmount, Note)OUTPUT INSERTED.* VALUES (@TableId, @UserId, @TotalAmount, @Note)');

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
            orderId: newOrderId,
            totalAmount: totalAmount
        });

    } catch (err) {

        await transaction.rollback();
        console.error('Sipariş oluşturulurken hata:',err);
        res.status(500).json ({ error: 'Sipariş oluşturulamadı'})
    }
    
}

module.exports = { createOrder };