const { sql, connectDB } = require('../config/db');
const { emitTablesChanged } = require('../config/socket');

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
        .query(`SELECT TableId, TotalAmount, Status FROM Orders WHERE OrderId = @OrderId`);

    if (orderResult.recordset.length === 0) {
        throw new Error('Sipariş bulunamadı.');
    }

    const { TableId, TotalAmount, Status } = orderResult.recordset[0];

    // İndirim düşüldükten sonra gerçekte ödenmesi gereken tutar
    const amountDue = TotalAmount - totalDiscount;

    if (netPaid >= amountDue && Status !== 'Paid') {
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, orderId)
            .query(`UPDATE Orders SET Status = 'Paid' WHERE OrderId = @OrderId`);

        // Sipariş tamamen ödendi -> masa otomatik olarak boşalır
        await new sql.Request(transaction)
            .input('TableId', sql.Int, TableId)
            .query(`UPDATE Tables SET Status = 'Empty' WHERE TableId = @TableId`);
    } else if (netPaid < amountDue && Status === 'Paid') {
        // Ödeme silindi veya iade edildi, toplam artık yetersiz -> geri çek
        await new sql.Request(transaction)
            .input('OrderId', sql.Int, orderId)
            .query(`UPDATE Orders SET Status = 'Served' WHERE OrderId = @OrderId`);

        // Masa yanlışlıkla boş görünmesin diye tekrar dolu işaretlenir
        await new sql.Request(transaction)
            .input('TableId', sql.Int, TableId)
            .query(`UPDATE Tables SET Status = 'Occupied' WHERE TableId = @TableId AND Status = 'Empty'`);
    }

    return { netPaid, totalDiscount, amountDue, TotalAmount };
};

// ============================================================
// YARDIMCI FONKSİYON
// Siparişteki her kalem için ödenmiş/kalan adedi döner.
// "Ödenmiş adet" sadece PaymentItems'a kaydedilmiş (yani kalem seçilerek
// yapılmış) ödemelerden hesaplanır — düz tutarla (lump-sum) yapılan bir
// ödeme hangi ürüne ait olduğunu belirtmediği için kalem bazında adet
// düşürmez (bkz. createPayment). Tamamen iade edilmiş (RefundAmount >=
// Amount) veya silinmiş ödemeler sayılmaz; kısmi iadeler basitlik için
// kalem tahsisini geri açmaz (iade akışı hangi ürünün iade edildiğini
// belirtmiyor).
// ============================================================
const getItemRemaining = async (pool, transaction, orderId) => {
    const request = transaction ? new sql.Request(transaction) : pool.request();
    const result = await request
        .input('OrderId', sql.Int, orderId)
        .query(`
            SELECT
                od.OrderDetailsId, od.ProductId, od.Quantity, od.UnitPrice,
                ISNULL(paid.PaidQuantity, 0) AS PaidQuantity,
                od.Quantity - ISNULL(paid.PaidQuantity, 0) AS RemainingQuantity
            FROM OrderDetails od
            LEFT JOIN (
                SELECT pi.OrderDetailsId, SUM(pi.Quantity) AS PaidQuantity
                FROM PaymentItems pi
                JOIN Payments p ON p.PaymentsId = pi.PaymentsId
                WHERE p.IsDeleted = 0 AND p.RefundAmount < p.Amount
                GROUP BY pi.OrderDetailsId
            ) paid ON paid.OrderDetailsId = od.OrderDetailsId
            WHERE od.OrderId = @OrderId
        `);
    return result.recordset;
};

// ============================================================
// 1. YENİ ÖDEME EKLE (garson/kasiyer erişebilir)
// GÜVENLİK: Amount/TipAmount/DiscountAmount negatif olamaz.
// GÜVENLİK: DiscountAmount > 0 ise sadece Cashier/Admin uygulayabilir.
// GÜVENLİK: Items gönderilirse Amount client'tan asla kabul edilmez;
// gerçek tutar DB'deki UnitPrice ve kalan adetlerden yeniden hesaplanır
// (createOrder'daki "fiyat sunucuda hesaplanır" ilkesiyle aynı).
//
// Body: { OrderId, PaymentMethod, TipAmount?, DiscountAmount?, InvoiceNumber?
//         Amount }                                  -- düz tutar (Items yoksa zorunlu)
//         Items?: [{ OrderDetailsId, Quantity }]     -- kalem bazlı kısmi ödeme
// ============================================================
const createPayment = async (req, res) => {
    const { OrderId, Amount, Items, TipAmount, DiscountAmount, PaymentMethod, InvoiceNumber } = req.body;
    const CreatedBy = req.user?.userId || null; // auth token'dan geliyor
    const userRole = req.user?.role;

    if (!OrderId || !PaymentMethod) {
        return res.status(400).json({ message: 'OrderId ve PaymentMethod zorunludur.' });
    }

    const hasItems = Array.isArray(Items) && Items.length > 0;

    if (!hasItems && (typeof Amount !== 'number' || Amount <= 0)) {
        return res.status(400).json({ message: 'Amount pozitif bir sayı olmalıdır (veya Items ile kalem bazlı ödeme belirtin).' });
    }

    if (hasItems) {
        for (const item of Items) {
            if (typeof item.OrderDetailsId !== 'number' || !Number.isInteger(item.Quantity) || item.Quantity <= 0) {
                return res.status(400).json({ message: 'Her Items girdisi için geçerli OrderDetailsId ve pozitif tam sayı Quantity gerekir.' });
            }
        }
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
            let amountToCharge = Amount;

            if (hasItems) {
                const remainingRows = await getItemRemaining(pool, transaction, OrderId);
                const remainingByItem = new Map(remainingRows.map((r) => [r.OrderDetailsId, r]));

                let computedAmount = 0;
                for (const item of Items) {
                    const row = remainingByItem.get(item.OrderDetailsId);
                    if (!row) {
                        throw new Error(`Sipariş kalemi bu siparişe ait değil veya bulunamadı (OrderDetailsId: ${item.OrderDetailsId})`);
                    }
                    if (item.Quantity > row.RemainingQuantity) {
                        throw new Error(`İstenen adet (${item.Quantity}), kalan ödenmemiş adedi (${row.RemainingQuantity}) aşıyor (OrderDetailsId: ${item.OrderDetailsId}).`);
                    }
                    computedAmount += item.Quantity * Number(row.UnitPrice);
                }
                amountToCharge = computedAmount;
            }

            if (!(amountToCharge > 0)) {
                throw new Error('Ödeme tutarı sıfırdan büyük olmalıdır.');
            }

            const insertResult = await new sql.Request(transaction)
                .input('OrderId', sql.Int, OrderId)
                .input('Amount', sql.Decimal(10, 2), amountToCharge)
                .input('TipAmount', sql.Decimal(10, 2), tip)
                .input('DiscountAmount', sql.Decimal(10, 2), discount)
                .input('PaymentMethod', sql.NVarChar(20), PaymentMethod)
                .input('InvoiceNumber', sql.NVarChar(50), InvoiceNumber || null)
                .input('CreatedBy', sql.Int, CreatedBy || null)
                .query(`
                    INSERT INTO Payments (OrderId, Amount, TipAmount, DiscountAmount, PaymentMethod, InvoiceNumber, CreatedBy)
                    OUTPUT INSERTED.PaymentsId
                    VALUES (@OrderId, @Amount, @TipAmount, @DiscountAmount, @PaymentMethod, @InvoiceNumber, @CreatedBy)
                `);

            const newPaymentId = insertResult.recordset[0].PaymentsId;

            if (hasItems) {
                for (const item of Items) {
                    await new sql.Request(transaction)
                        .input('PaymentsId', sql.Int, newPaymentId)
                        .input('OrderDetailsId', sql.Int, item.OrderDetailsId)
                        .input('Quantity', sql.Int, item.Quantity)
                        .query(`INSERT INTO PaymentItems (PaymentsId, OrderDetailsId, Quantity) VALUES (@PaymentsId, @OrderDetailsId, @Quantity)`);
                }
            }

            const { netPaid, totalDiscount, amountDue, TotalAmount } = await recalculateOrderStatus(transaction, OrderId);

            await transaction.commit();
            emitTablesChanged();

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

        const itemRows = await getItemRemaining(pool, null, orderId);

        return res.status(200).json({
            orderId: Number(orderId),
            totalAmount: TotalAmount,
            totalDiscount,
            amountDue,
            totalPaid: netPaid,
            totalTip,
            remaining,
            isFullyPaid: remaining === 0,
            orderStatus: Status,
            items: itemRows.map((r) => ({
                OrderDetailsId: r.OrderDetailsId,
                ProductId: r.ProductId,
                Quantity: r.Quantity,
                UnitPrice: r.UnitPrice,
                PaidQuantity: r.PaidQuantity,
                RemainingQuantity: r.RemainingQuantity
            }))
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
            emitTablesChanged();
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
            emitTablesChanged();
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
            emitTablesChanged();
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
    refundPayment,
    recalculateOrderStatus
};