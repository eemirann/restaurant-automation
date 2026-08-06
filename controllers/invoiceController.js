const { sql, connectDB } = require('../config/db');
const { issueEArsivInvoice } = require('../utils/invoiceProvider');

const TCKN_REGEX = /^\d{11}$/;

// ============================================================
// SİPARİŞE AİT FATURALARI LİSTELE
// ============================================================
async function getInvoicesForOrder(req, res) {
    try {
        const { orderId } = req.params;
        const pool = await connectDB();
        const result = await pool.request()
            .input('OrderId', sql.Int, orderId)
            .query(`SELECT * FROM Invoices WHERE OrderId = @OrderId ORDER BY InvoicesId DESC`);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Sipariş faturaları getirilirken hata:', err);
        res.status(500).json({ error: 'Faturalar getirilemedi' });
    }
}

// ============================================================
// TÜM FATURALARI LİSTELE (Faturalar sayfası — admin)
// ============================================================
async function getAllInvoices(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query(`
            SELECT i.*, o.TableId, t.TableNumber
            FROM Invoices i
            JOIN Orders o ON o.OrderId = i.OrderId
            LEFT JOIN Tables t ON t.TableId = o.TableId
            ORDER BY i.InvoicesId DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Faturalar getirilirken hata:', err);
        res.status(500).json({ error: 'Faturalar getirilemedi' });
    }
}

// ============================================================
// SİPARİŞ İÇİN E-ARŞİV FATURASI KES
//
// Aynı sipariş için zaten "Issued" bir fatura varsa tekrar kesilmez
// (gerçek e-Arşiv'de aynı işlem için mükerrer fatura ciddi bir hatadır) —
// bunun yerine mevcut fatura 409 ile döndürülür.
// ============================================================
async function createInvoice(req, res) {
    try {
        const { orderId } = req.params;
        const { CustomerName, CustomerTckn, CustomerEmail } = req.body;
        const CreatedBy = req.user?.userId || null;

        if (CustomerTckn && !TCKN_REGEX.test(CustomerTckn)) {
            return res.status(400).json({ error: 'TCKN 11 haneli bir sayı olmalıdır' });
        }

        const pool = await connectDB();

        const existing = await pool.request()
            .input('OrderId', sql.Int, orderId)
            .query(`SELECT TOP 1 * FROM Invoices WHERE OrderId = @OrderId AND Status = 'Issued' ORDER BY InvoicesId DESC`);
        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Bu sipariş için zaten kesilmiş bir fatura var.', invoice: existing.recordset[0] });
        }

        const orderResult = await pool.request()
            .input('OrderId', sql.Int, orderId)
            .query(`
                SELECT o.OrderId, o.TotalAmount,
                       (SELECT COALESCE(SUM(DiscountAmount), 0) FROM Payments WHERE OrderId = o.OrderId AND IsDeleted = 0) AS TotalDiscount
                FROM Orders o WHERE o.OrderId = @OrderId
            `);
        if (orderResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Sipariş bulunamadı' });
        }

        const itemsResult = await pool.request()
            .input('OrderId', sql.Int, orderId)
            .query(`
                SELECT od.Quantity, od.UnitPrice, p.Name, p.VatRate
                FROM OrderDetails od JOIN Products p ON p.ProductId = od.ProductId
                WHERE od.OrderId = @OrderId
            `);

        const settingsResult = await pool.request().query(`SELECT TOP 1 EArsivVatRate FROM AppSettings ORDER BY AppSettingsId ASC`);
        const globalVatRate = Number(settingsResult.recordset[0]?.EArsivVatRate ?? 10);

        // ============================================================
        // ÜRÜN BAZLI KDV — TEK SABİT ORAN KULLANILMAZ.
        //
        // Her kalem KENDİ KDV oranıyla (Products.VatRate; boşsa Ayarlar'daki
        // genel oran) hesaplanır, sonra kalemler toplanır. Menü fiyatları KDV
        // dahil kabul edildiği için her kalemin vergisi kendi fiyatından geriye
        // doğru çıkarılır (bkz. migrations/2026_08_09_product_vat_rate.sql).
        //
        // İSKONTO: Payments.DiscountAmount sipariş SEVİYESİNDE tutulur, kalem
        // bazlı değildir — hangi ürüne ne kadar iskonto düştüğü bilinmez. Bu
        // yüzden iskonto, kalemlerin KDV'siz toplamına ORANTILI dağıtılır:
        // iskonto sonrası tutar / iskontosuz toplam = discountRatio, her
        // kalemin vergisi bu oranla ölçeklenir. Tüm kalemler AYNI orana
        // sahipse (ör. hepsi boşsa) bu, eski tek-oran formülüyle MATEMATİKSEL
        // OLARAK BİREBİR AYNI sonucu verir — yani bu bir genelleme, davranış
        // kırılması değil.
        // ============================================================
        let grossBeforeDiscount = 0;
        let taxBeforeDiscount = 0;
        // EffectiveVatRate ile zenginleştirilir — gerçek bir entegratöre
        // bağlanıldığında her satırın kendi KDV oranını GİB'e bildirmesi gerekir.
        const invoiceItems = itemsResult.recordset.map((item) => {
            const itemVat = item.VatRate !== null && item.VatRate !== undefined ? Number(item.VatRate) : globalVatRate;
            const lineGross = Number(item.Quantity) * Number(item.UnitPrice);
            const lineNet = lineGross / (1 + itemVat / 100);
            grossBeforeDiscount += lineGross;
            taxBeforeDiscount += lineGross - lineNet;
            return { ...item, EffectiveVatRate: itemVat };
        });

        const { TotalAmount, TotalDiscount } = orderResult.recordset[0];
        const amount = Number(TotalAmount) - Number(TotalDiscount || 0);
        // grossBeforeDiscount 0 olabilir (ör. tüm kalemler silinmiş/kombo
        // sipariş) — bu durumda kalem bazlı orana dönemeyiz, genel orana düşülür.
        const discountRatio = grossBeforeDiscount > 0 ? amount / grossBeforeDiscount : 1;
        const taxAmount = Math.round(taxBeforeDiscount * discountRatio * 100) / 100;

        const insertResult = await pool.request()
            .input('OrderId', sql.Int, orderId)
            .input('CustomerName', sql.NVarChar(150), CustomerName?.trim() || null)
            .input('CustomerTckn', sql.NVarChar(11), CustomerTckn || null)
            .input('CustomerEmail', sql.NVarChar(150), CustomerEmail?.trim() || null)
            .input('Amount', sql.Decimal(10, 2), amount)
            .input('TaxAmount', sql.Decimal(10, 2), taxAmount)
            .input('CreatedBy', sql.Int, CreatedBy)
            .query(`
                INSERT INTO Invoices (OrderId, CustomerName, CustomerTckn, CustomerEmail, Amount, TaxAmount, CreatedBy)
                OUTPUT INSERTED.InvoicesId
                VALUES (@OrderId, @CustomerName, @CustomerTckn, @CustomerEmail, @Amount, @TaxAmount, @CreatedBy)
            `);
        const invoicesId = insertResult.recordset[0].InvoicesId;

        let providerResult;
        try {
            providerResult = await issueEArsivInvoice({
                orderId,
                amount,
                taxAmount,
                customerName: CustomerName?.trim() || null,
                customerTckn: CustomerTckn || null,
                customerEmail: CustomerEmail?.trim() || null,
                items: invoiceItems,
            });
        } catch (providerErr) {
            providerResult = { success: false, error: providerErr.message };
        }

        const finalStatus = providerResult.success ? 'Issued' : 'Failed';
        const updateResult = await pool.request()
            .input('InvoicesId', sql.Int, invoicesId)
            .input('Status', sql.NVarChar(20), finalStatus)
            .input('InvoiceNumber', sql.NVarChar(50), providerResult.invoiceNumber || null)
            .input('PdfUrl', sql.NVarChar(500), providerResult.pdfUrl || null)
            .input('ProviderResponse', sql.NVarChar(sql.MAX), JSON.stringify(providerResult.raw || null))
            .input('ErrorMessage', sql.NVarChar(500), providerResult.error || null)
            .query(`
                UPDATE Invoices
                SET Status = @Status, InvoiceNumber = @InvoiceNumber, PdfUrl = @PdfUrl,
                    ProviderResponse = @ProviderResponse, ErrorMessage = @ErrorMessage,
                    IssuedAt = CASE WHEN @Status = 'Issued' THEN GETDATE() ELSE NULL END
                OUTPUT INSERTED.*
                WHERE InvoicesId = @InvoicesId
            `);

        const finalRow = updateResult.recordset[0];
        res.status(providerResult.success ? 201 : 502).json(finalRow);
    } catch (err) {
        console.error('Fatura kesilirken hata:', err);
        res.status(500).json({ error: 'Fatura kesilemedi' });
    }
}

module.exports = { getInvoicesForOrder, getAllInvoices, createInvoice };
