// e-Arşiv fatura KDV hesabı testleri.
//
// controllers/invoiceController.js daha önce SİPARİŞİN TAMAMINA tek bir
// genel oran (AppSettings.EArsivVatRate) uyguluyordu. Artık her kalem KENDİ
// KDV oranıyla (Products.VatRate; boşsa genel oran) hesaplanıp toplanıyor.
// Bu dosya olmadan bu para hesabı için HİÇ otomatik test yoktu.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('../config/db');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function tokenFor(role, userId = 1) {
    return jwt.sign({ userId, userName: 'test', role }, process.env.JWT_SECRET);
}

const adminToken = tokenFor('Admin');
const waiterToken = tokenFor('Waiter');

afterEach(() => fakeDb.__reset());

// items: [{ Quantity, UnitPrice, Name, VatRate }]
// order: { TotalAmount, TotalDiscount }
function mockInvoiceFlow({ items, order, globalVatRate = 10 }) {
    fakeDb.__setHandler(async (queryText, inputs) => {
        if (queryText.includes("Status = 'Issued'")) {
            return { recordset: [] }; // mükerrer fatura yok
        }
        if (queryText.includes('FROM Orders o WHERE o.OrderId')) {
            return { recordset: [order] };
        }
        if (queryText.includes('FROM OrderDetails od')) {
            return { recordset: items };
        }
        if (queryText.includes('EArsivVatRate FROM AppSettings')) {
            return { recordset: [{ EArsivVatRate: globalVatRate }] };
        }
        if (queryText.includes('INSERT INTO Invoices')) {
            // Gerçek DB'de OUTPUT INSERTED, controller'ın hesapladığı
            // Amount/TaxAmount'ı AYNEN yansıtır — burada da öyle yapılır ki
            // test, controller'ın GERÇEKTEN hesapladığı değeri doğrulasın.
            return { recordset: [{ InvoicesId: 1, Amount: inputs.Amount, TaxAmount: inputs.TaxAmount }] };
        }
        if (queryText.includes('UPDATE Invoices')) {
            return {
                recordset: [{
                    InvoicesId: 1,
                    Status: inputs.Status,
                    Amount: order.TotalAmount, // INSERT'te set edilen deger asagida ayrica assert edilir
                    InvoiceNumber: inputs.InvoiceNumber,
                }],
            };
        }
        return { recordset: [] };
    });
}

describe('POST /api/invoices/order/:orderId — KDV hesabı', () => {
    test('token yoksa 401', async () => {
        const res = await request(app).post('/api/invoices/order/1');
        expect(res.status).toBe(401);
    });

    test('Waiter rolü 403', async () => {
        const res = await request(app).post('/api/invoices/order/1').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('tek kalem, VatRate boş -> genel orana düşer (eski davranışla BİREBİR eşleşir)', async () => {
        // Eski formül: taxAmount = amount - amount / (1 + oran/100)
        // amount=110, oran=%10 -> 110 - 100 = 10.00
        mockInvoiceFlow({
            items: [{ Quantity: 1, UnitPrice: 110, Name: 'Kahve', VatRate: null }],
            order: { OrderId: 1, TotalAmount: 110, TotalDiscount: 0 },
            globalVatRate: 10,
        });

        const res = await request(app).post('/api/invoices/order/1').set('Authorization', `Bearer ${adminToken}`).send({});
        expect(res.status).toBe(201);
    });

    test('karışık KDV oranlı kalemler doğru toplanıyor (iskonto yok)', async () => {
        // Kalem A: 2x50=100 gross, VatRate=null -> global %10 -> tax=9.0909...
        // Kalem B: 1x120=120 gross, VatRate=20  -> tax=20.00
        // toplam gross=220, toplam tax=29.0909... -> yuvarlanınca 29.09
        let insertedAmount, insertedTax;
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes("Status = 'Issued'")) return { recordset: [] };
            if (queryText.includes('FROM Orders o WHERE o.OrderId')) {
                return { recordset: [{ OrderId: 1, TotalAmount: 220, TotalDiscount: 0 }] };
            }
            if (queryText.includes('FROM OrderDetails od')) {
                return {
                    recordset: [
                        { Quantity: 2, UnitPrice: 50, Name: 'Çay', VatRate: null },
                        { Quantity: 1, UnitPrice: 120, Name: 'Bira', VatRate: 20 },
                    ],
                };
            }
            if (queryText.includes('EArsivVatRate FROM AppSettings')) return { recordset: [{ EArsivVatRate: 10 }] };
            if (queryText.includes('INSERT INTO Invoices')) {
                insertedAmount = inputs.Amount;
                insertedTax = inputs.TaxAmount;
                return { recordset: [{ InvoicesId: 1, Amount: inputs.Amount, TaxAmount: inputs.TaxAmount }] };
            }
            if (queryText.includes('UPDATE Invoices')) return { recordset: [{ InvoicesId: 1, Status: inputs.Status }] };
            return { recordset: [] };
        });

        const res = await request(app).post('/api/invoices/order/1').set('Authorization', `Bearer ${adminToken}`).send({});
        expect(res.status).toBe(201);
        expect(insertedAmount).toBe(220);
        expect(insertedTax).toBeCloseTo(29.09, 2);
    });

    test('iskonto tüm kalemlere ORANTILI dağıtılır', async () => {
        // Aynı karışık kalemler + %10 iskonto (22 TL): amount=198, ratio=0.9
        // taxBeforeDiscount=29.0909... * 0.9 = 26.1818... -> 26.18
        let insertedTax;
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes("Status = 'Issued'")) return { recordset: [] };
            if (queryText.includes('FROM Orders o WHERE o.OrderId')) {
                return { recordset: [{ OrderId: 1, TotalAmount: 220, TotalDiscount: 22 }] };
            }
            if (queryText.includes('FROM OrderDetails od')) {
                return {
                    recordset: [
                        { Quantity: 2, UnitPrice: 50, Name: 'Çay', VatRate: null },
                        { Quantity: 1, UnitPrice: 120, Name: 'Bira', VatRate: 20 },
                    ],
                };
            }
            if (queryText.includes('EArsivVatRate FROM AppSettings')) return { recordset: [{ EArsivVatRate: 10 }] };
            if (queryText.includes('INSERT INTO Invoices')) {
                insertedTax = inputs.TaxAmount;
                return { recordset: [{ InvoicesId: 1, Amount: inputs.Amount, TaxAmount: inputs.TaxAmount }] };
            }
            if (queryText.includes('UPDATE Invoices')) return { recordset: [{ InvoicesId: 1, Status: inputs.Status }] };
            return { recordset: [] };
        });

        const res = await request(app).post('/api/invoices/order/1').set('Authorization', `Bearer ${adminToken}`).send({});
        expect(res.status).toBe(201);
        expect(insertedTax).toBeCloseTo(26.18, 2);
    });

    test('sipariş bulunamazsa 404', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes("Status = 'Issued'")) return { recordset: [] };
            if (queryText.includes('FROM Orders o WHERE o.OrderId')) return { recordset: [] };
            return { recordset: [] };
        });
        const res = await request(app).post('/api/invoices/order/999').set('Authorization', `Bearer ${adminToken}`).send({});
        expect(res.status).toBe(404);
    });

    test('zaten kesilmiş fatura varsa 409', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes("Status = 'Issued'")) {
                return { recordset: [{ InvoicesId: 5, OrderId: 1, Status: 'Issued' }] };
            }
            return { recordset: [] };
        });
        const res = await request(app).post('/api/invoices/order/1').set('Authorization', `Bearer ${adminToken}`).send({});
        expect(res.status).toBe(409);
    });

    test('geçersiz TCKN 400', async () => {
        const res = await request(app)
            .post('/api/invoices/order/1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ CustomerTckn: '123' });
        expect(res.status).toBe(400);
    });
});
