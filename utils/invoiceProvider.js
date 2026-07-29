// ============================================================
// E-ARŞİV FATURA SAĞLAYICISI — YER TUTUCU (MOCK)
//
// Bu modül, gerçek bir e-Arşiv entegratör firmasının (Foriba, Uyumsoft,
// Nesbilgi, QNB eFinans, Turkcell e-Fatura vb.) API'sine bağlanacağı NOKTAYI
// temsil eder. İşletme hangi entegratörle anlaşırsa, issueEArsivInvoice
// fonksiyonunun İÇİ o firmanın API çağrısıyla değiştirilir — bu fonksiyonu
// çağıran controllers/invoiceController.js hiç değişmeden kalır.
//
// ŞU AN GERÇEK BİR GİB/ENTEGRATÖR BAĞLANTISI YOK. Sahte bir fatura numarası
// üretip "issued" döner. Üretim (canlı) ortamına geçmeden önce mutlaka
// gerçek entegratör API'si ile değiştirilmelidir.
// ============================================================

async function issueEArsivInvoice({ orderId, amount, taxAmount, customerName, customerTckn, customerEmail, items }) {
    // Gerçek entegrasyonda burada örneğin şuna benzer bir çağrı olur:
    //   const res = await axios.post('https://api.<entegrator>.com/v1/earsiv', {
    //       CustomerName: customerName, CustomerTckn: customerTckn, Amount: amount, ...
    //   }, { headers: { Authorization: `Bearer ${process.env.INVOICE_PROVIDER_API_KEY}` } });
    //   return { success: true, invoiceNumber: res.data.invoiceNumber, pdfUrl: res.data.pdfUrl, raw: res.data };

    const invoiceNumber = `MOCK-EARC-${orderId}-${Date.now().toString().slice(-6)}`;

    return {
        success: true,
        invoiceNumber,
        pdfUrl: null, // gerçek entegratörler genelde burada görüntülenebilir bir PDF/HTML linki döner
        raw: {
            mock: true,
            note: 'Gerçek bir entegratör bağlanana kadar bu fatura SİMÜLASYONDUR, GİB\'e iletilmemiştir.',
            orderId,
            amount,
            taxAmount,
            customerName,
            customerTckn,
            customerEmail,
            items,
        },
    };
}

module.exports = { issueEArsivInvoice };
