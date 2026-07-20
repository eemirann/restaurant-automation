const { sql, connectDB } = require('../config/db');

// ============================================================
// YARDIMCI FONKSİYON
// Bir siparişin net ödemesini (iadeler düşülmüş) yeniden hesaplar
// ve gerekiyorsa Orders.Status'u günceller.
// ============================================================
const recalculateOrderStatus = async (transaction, orderId) => {
    const sumResult = await new sql.Request(transaction)
        .input('OrderId', sql.Int, orderId)
        .query(`
            SELECT SUM(Amount - RefundAmount) AS NetPaid
            FROM Payments
            WHERE OrderId = @OrderId AND IsDeleted = 0
        `);

    const netPaid = sumResult.recordset[0].NetPaid || 0;

    const orderResult = await new sql.Request(transaction)
        .input('OrderId', sql.Int, orderId)
        .query(`SELECT TotalAmount, Status FROM Orders WHERE OrderId = @OrderId`);

    if (orderResult.recordset.length === 0) {
        throw new Error('Sipariş bulunamadı.');
    }

    const { TotalAmount, Status } = orderResult.recordset[0];

    if (netPaid >= TotalAmount && Status !== 'Paid') {
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, orderId)
            .query(`UPDATE Orders SET Status = 'Paid' WHERE OrderId = @OrderId`);
    } else if (netPaid < TotalAmount && Status === 'Paid') {
        // Ödeme silindi veya iade edildi, toplam artık yetersiz -> geri çek
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, orderId)
            .query(`UPDATE Orders SET Status = 'Served' WHERE OrderId = @OrderId`);
    }

    return { netPaid, TotalAmount };
};

// ============================================================
// 1. YENİ ÖDEME EKLE (garson/kasiyer erişebilir)
// ============================================================
const createPayment = async (req, res) => {
    const { OrderId, Amount, TipAmount, DiscountAmount, PaymentMethod, InvoiceNumber } = req.body;

    if (!OrderId || !Amount || !PaymentMethod) {
        return res.status(400).json({ message: 'OrderId, Amount ve PaymentMethod zorunludur.' });
    }

    const validMethods = ['Cash', 'Card', 'FoodCard', 'QR'];
    if (!validMethods.includes(PaymentMethod)) {
        return res.status(400).json({ message: 'Geçersiz ödeme yöntemi.' });
    }

    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const request = new sql.Request(transaction);

            await request
                .input('OrderId', sql.Int, OrderId)
                .input('Amount', sql.Decimal(10, 2), Amount)
                .input('TipAmount', sql.Decimal(10, 2), TipAmount || 0)
                .input('DiscountAmount', sql.Decimal(10, 2), DiscountAmount || 0)
                .input('PaymentMethod', sql.NVarChar(20), PaymentMethod)
                .input('InvoiceNumber', sql.NVarChar(50), InvoiceNumber || null)
                .query(`
                    INSERT INTO Payments (OrderId, Amount, TipAmount, DiscountAmount, PaymentMethod, InvoiceNumber)
                    VALUES (@OrderId, @Amount, @TipAmount, @DiscountAmount, @PaymentMethod, @InvoiceNumber)
                `);

            const { netPaid, TotalAmount } = await recalculateOrderStatus(transaction, OrderId);

            await transaction.commit();

            return res.status(201).json({
                message: 'Ödeme başarıyla kaydedildi.',
                totalPaid: netPaid,
                totalAmount: TotalAmount,
                orderStatus: netPaid >= TotalAmount ? 'Paid' : 'Pending'
            });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ödeme kaydedilirken hata oluştu.', error: err.message });
    }
};

// ============================================================
// 2. SİPARİŞE AİT ÖDEMELERİ LİSTELE (garson/kasiyer erişebilir)
// ============================================================
const getPaymentsByOrder = async (req, res) => {
    const { orderId } = req.params;

    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('OrderId', sql.Int, orderId)
            .query(`
                SELECT Id, OrderId, Amount, TipAmount, DiscountAmount,
                       PaymentMethod, InvoiceNumber, PaymentDate,
                       RefundAmount, RefundDate, RefundedBy,
                       IsDeleted, DeletedBy
                FROM Payments
                WHERE OrderId = @OrderId AND IsDeleted = 0
                ORDER BY PaymentDate ASC
            `);

        return res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ödemeler getirilirken hata oluştu.', error: err.message });
    }
};

// ============================================================
// 3. ÖDEME İPTAL ET / SİL (SADECE YÖNETİCİ - auth gelince route'ta kısıtlanacak)
// ============================================================
const deletePayment = async (req, res) => {
    const { id } = req.params;
    const { DeletedBy } = req.body; // auth gelince req.user.id'den alınacak

    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const paymentResult = await new sql.Request(transaction)
                .input('Id', sql.Int, id)
                .query(`SELECT OrderId, IsDeleted FROM Payments WHERE Id = @Id`);

            if (paymentResult.recordset.length === 0) {
                throw new Error('Ödeme bulunamadı.');
            }
            if (paymentResult.recordset[0].IsDeleted) {
                throw new Error('Bu ödeme zaten silinmiş.');
            }

            const { OrderId } = paymentResult.recordset[0];

            await new sql.Request(transaction)
                .input('Id', sql.Int, id)
                .input('DeletedBy', sql.Int, DeletedBy || null)
                .query(`
                    UPDATE Payments
                    SET IsDeleted = 1, DeletedBy = @DeletedBy
                    WHERE Id = @Id
                `);

            await recalculateOrderStatus(transaction, OrderId);

            await transaction.commit();
            return res.status(200).json({ message: 'Ödeme iptal edildi.' });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ödeme iptal edilirken hata oluştu.', error: err.message });
    }
};

// ============================================================
// 4. İADE İŞLE (SADECE YÖNETİCİ - auth gelince route'ta kısıtlanacak)
// ============================================================
const refundPayment = async (req, res) => {
    const { id } = req.params;
    const { RefundAmount, RefundedBy } = req.body; // auth gelince RefundedBy = req.user.id

    if (!RefundAmount || RefundAmount <= 0) {
        return res.status(400).json({ message: 'Geçerli bir RefundAmount girilmeli.' });
    }

    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const paymentResult = await new sql.Request(transaction)
                .input('Id', sql.Int, id)
                .query(`SELECT OrderId, Amount, RefundAmount, IsDeleted FROM Payments WHERE Id = @Id`);

            if (paymentResult.recordset.length === 0) {
                throw new Error('Ödeme bulunamadı.');
            }

            const payment = paymentResult.recordset[0];
            if (payment.IsDeleted) {
                throw new Error('Silinmiş bir ödeme iade edilemez.');
            }

            const totalRefundAfter = payment.RefundAmount + RefundAmount;
            if (totalRefundAfter > payment.Amount) {
                throw new Error('İade tutarı, ödeme tutarını aşamaz.');
            }

            await new sql.Request(transaction)
                .input('Id', sql.Int, id)
                .input('RefundAmount', sql.Decimal(10, 2), totalRefundAfter)
                .input('RefundedBy', sql.Int, RefundedBy || null)
                .query(`
                    UPDATE Payments
                    SET RefundAmount = @RefundAmount, RefundDate = GETDATE(), RefundedBy = @RefundedBy
                    WHERE Id = @Id
                `);

            await recalculateOrderStatus(transaction, payment.OrderId);

            await transaction.commit();
            return res.status(200).json({ message: 'İade işlendi.', totalRefunded: totalRefundAfter });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'İade işlenirken hata oluştu.', error: err.message });
    }
};

module.exports = {
    createPayment,
    getPaymentsByOrder,
    deletePayment,
    refundPayment
};