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
            SELECT
                SUM(Amount - RefundAmount) AS NetPaid,
                SUM(DiscountAmount) AS TotalDiscount
            FROM Payments
            WHERE OrderId = @OrderId AND IsDeleted = 0
        `);

    const netPaid = sumResult.recordset[0].NetPaid || 0;
    const totalDiscount = sumResult.recordset[0].TotalDiscount || 0;

    const orderResult = await new sql.Request(transaction)
        .input('OrderId', sql.Int, orderId)
        .query(`SELECT TotalAmount, Status FROM Orders WHERE OrderId = @OrderId`);

    if (orderResult.recordset.length === 0) {
        throw new Error('Sipariş bulunamadı.');
    }

    const { TotalAmount, Status } = orderResult.recordset[0];

    // İndirim düşüldükten sonra gerçekte ödenmesi gereken tutar
    const amountDue = TotalAmount - totalDiscount;

    if (netPaid >= amountDue && Status !== 'Paid') {
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, orderId)
            .query(`UPDATE Orders SET Status = 'Paid' WHERE OrderId = @OrderId`);
    } else if (netPaid < amountDue && Status === 'Paid') {
        // Ödeme silindi veya iade edildi, toplam artık yetersiz -> geri çek
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, orderId)
            .query(`UPDATE Orders SET Status = 'Served' WHERE OrderId = @OrderId`);
    }

    return { netPaid, totalDiscount, amountDue, TotalAmount };
};

// ============================================================
// 1. YENİ ÖDEME EKLE (garson/kasiyer erişebilir)
// GÜVENLİK: Amount/TipAmount/DiscountAmount negatif olamaz.
// GÜVENLİK: DiscountAmount > 0 ise sadece Cashier/Admin uygulayabilir.
// ============================================================
const createPayment = async (req, res) => {
    const { OrderId, Amount, TipAmount, DiscountAmount, PaymentMethod, InvoiceNumber } = req.body;
    const CreatedBy = req.user?.userId || null; // auth token'dan geliyor
    const userRole = req.user?.role;

    if (!OrderId || !Amount || !PaymentMethod) {
        return res.status(400).json({ message: 'OrderId, Amount ve PaymentMethod zorunludur.' });
    }

    if (typeof Amount !== 'number' || Amount <= 0) {
        return res.status(400).json({ message: 'Amount pozitif bir sayı olmalıdır.' });
    }

    const tip = TipAmount || 0;
    if (typeof tip !== 'number' || tip < 0) {
        return res.status(400).json({ message: 'TipAmount negatif olamaz.' });
    }

    const discount = DiscountAmount || 0;
    if (typeof discount !== 'number' || discount < 0) {
        return res.status(400).json({ message: 'DiscountAmount negatif olamaz.' });
    }

    // İndirim sadece Cashier/Admin tarafından uygulanabilir
    if (discount > 0 && !['Cashier', 'Admin'].includes(userRole)) {
        return res.status(403).json({ message: 'İndirim uygulama yetkiniz yok. Bu işlem sadece Kasiyer/Admin tarafından yapılabilir.' });
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
                .input('TipAmount', sql.Decimal(10, 2), tip)
                .input('DiscountAmount', sql.Decimal(10, 2), discount)
                .input('PaymentMethod', sql.NVarChar(20), PaymentMethod)
                .input('InvoiceNumber', sql.NVarChar(50), InvoiceNumber || null)
                .input('CreatedBy', sql.Int, CreatedBy || null)
                .query(`
                    INSERT INTO Payments (OrderId, Amount, TipAmount, DiscountAmount, PaymentMethod, InvoiceNumber, CreatedBy)
                    VALUES (@OrderId, @Amount, @TipAmount, @DiscountAmount, @PaymentMethod, @InvoiceNumber, @CreatedBy)
                `);

            const { netPaid, totalDiscount, amountDue, TotalAmount } = await recalculateOrderStatus(transaction, OrderId);

            await transaction.commit();

            return res.status(201).json({
                message: 'Ödeme başarıyla kaydedildi.',
                totalPaid: netPaid,
                totalDiscount,
                amountDue,
                totalAmount: TotalAmount,
                remaining: Math.max(amountDue - netPaid, 0),
                orderStatus: netPaid >= amountDue ? 'Paid' : 'Pending'
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
                SELECT PaymentsId AS Id, OrderId, Amount, TipAmount, DiscountAmount,
                       PaymentMethod, InvoiceNumber, PaymentDate,
                       RefundAmount, RefundDate, RefundedBy,
                       IsDeleted, DeletedBy, CreatedBy
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
// 3. SİPARİŞİN BAKİYE DURUMUNU GÖSTER (partial payment takibi için)
// TotalAmount, indirim, ödenen, kalan tutarı tek seferde döner
// ============================================================
const getOrderBalance = async (req, res) => {
    const { orderId } = req.params;

    try {
        const pool = await connectDB();

        const sumResult = await pool.request()
            .input('OrderId', sql.Int, orderId)
            .query(`
                SELECT
                    SUM(Amount - RefundAmount) AS NetPaid,
                    SUM(DiscountAmount) AS TotalDiscount,
                    SUM(TipAmount) AS TotalTip
                FROM Payments
                WHERE OrderId = @OrderId AND IsDeleted = 0
            `);

        const orderResult = await pool.request()
            .input('OrderId', sql.Int, orderId)
            .query(`SELECT TotalAmount, Status FROM Orders WHERE OrderId = @OrderId`);

        if (orderResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Sipariş bulunamadı.' });
        }

        const netPaid = sumResult.recordset[0].NetPaid || 0;
        const totalDiscount = sumResult.recordset[0].TotalDiscount || 0;
        const totalTip = sumResult.recordset[0].TotalTip || 0;
        const { TotalAmount, Status } = orderResult.recordset[0];
        const amountDue = TotalAmount - totalDiscount;
        const remaining = Math.max(amountDue - netPaid, 0);

        return res.status(200).json({
            orderId: Number(orderId),
            totalAmount: TotalAmount,
            totalDiscount,
            amountDue,
            totalPaid: netPaid,
            totalTip,
            remaining,
            isFullyPaid: remaining === 0,
            orderStatus: Status
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Bakiye getirilirken hata oluştu.', error: err.message });
    }
};

// ============================================================
// 4. ÖDEME İPTAL ET / SİL (SADECE ADMIN)
// ============================================================
const deletePayment = async (req, res) => {
    const { id } = req.params;
    const DeletedBy = req.user?.userId || null; // auth token'dan geliyor

    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const paymentResult = await new sql.Request(transaction)
                .input('Id', sql.Int, id)
                .query(`SELECT OrderId, IsDeleted FROM Payments WHERE PaymentsId = @Id`);

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
                    WHERE PaymentsId = @Id
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
// RESTORE - Yanlışlıkla silinen ödemeyi geri getir (SADECE ADMIN)
// ============================================================
const restorePayment = async (req, res) => {
    const { id } = req.params;

    try {
        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const paymentResult = await new sql.Request(transaction)
                .input('Id', sql.Int, id)
                .query(`SELECT OrderId, IsDeleted FROM Payments WHERE PaymentsId = @Id`);

            if (paymentResult.recordset.length === 0) {
                throw new Error('Ödeme bulunamadı.');
            }
            if (!paymentResult.recordset[0].IsDeleted) {
                throw new Error('Bu ödeme zaten aktif, geri alınacak bir şey yok.');
            }

            const { OrderId } = paymentResult.recordset[0];

            await new sql.Request(transaction)
                .input('Id', sql.Int, id)
                .query(`
                    UPDATE Payments
                    SET IsDeleted = 0, DeletedBy = NULL
                    WHERE PaymentsId = @Id
                `);

            await recalculateOrderStatus(transaction, OrderId);

            await transaction.commit();
            return res.status(200).json({ message: 'Ödeme geri alındı.' });

        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Ödeme geri alınırken hata oluştu.', error: err.message });
    }
};

// ============================================================
// 5. İADE İŞLE (SADECE ADMIN)
// ============================================================
const refundPayment = async (req, res) => {
    const { id } = req.params;
    const { RefundAmount } = req.body;
    const RefundedBy = req.user?.userId || null; // auth token'dan geliyor

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
                .query(`SELECT OrderId, Amount, RefundAmount, IsDeleted FROM Payments WHERE PaymentsId = @Id`);

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
                    WHERE PaymentsId = @Id
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
    getOrderBalance,
    deletePayment,
    restorePayment,
    refundPayment
};