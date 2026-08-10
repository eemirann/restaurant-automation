process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('../config/db');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function tokenFor(role, userId = 1) {
    return jwt.sign({ userId, userName: 'test', role }, process.env.JWT_SECRET);
}

const waiterToken = tokenFor('Waiter');
const cashierToken = tokenFor('Cashier');
const adminToken = tokenFor('Admin');

afterEach(() => fakeDb.__reset());

describe('POST /api/payments - doğrulama', () => {
    // Doğrulama testleri Cashier token'ıyla yapılır (Waiter route seviyesinde
    // zaten engelleniyor, bkz. aşağıdaki "yetki" describe bloğu — burada asıl
    // test edilen Amount/PaymentMethod doğrulaması, rol kısıtı değil).
    test('OrderId veya PaymentMethod eksikse 400 döner', async () => {
        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ Amount: 10 });
        expect(res.status).toBe(400);
    });

    test('Amount negatifse ve Items yoksa 400 döner', async () => {
        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ OrderId: 1, PaymentMethod: 'Cash', Amount: -5 });
        expect(res.status).toBe(400);
    });

    test('geçersiz PaymentMethod 400 döner', async () => {
        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ OrderId: 1, PaymentMethod: 'Bitcoin', Amount: 10 });
        expect(res.status).toBe(400);
    });

    test('Waiter indirim uygulamaya çalışırsa 403 döner (sadece Cashier/Admin)', async () => {
        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ OrderId: 1, PaymentMethod: 'Cash', Amount: 10, DiscountAmount: 5 });
        expect(res.status).toBe(403);
    });

    test('token yoksa 401 döner', async () => {
        const res = await request(app).post('/api/payments').send({ OrderId: 1, PaymentMethod: 'Cash', Amount: 10 });
        expect(res.status).toBe(401);
    });
});

describe('POST /api/payments - yetki (Garson ödeme alamaz)', () => {
    // Cashier'ın normal ödeme alabildiği zaten yukarıdaki "kalem bazlı tutar
    // hesaplama" testinde (201 dönüyor) kanıtlanıyor — burada sadece Waiter'ın
    // engellendiğini doğrulamak yeterli.
    test('Waiter, geçerli bir ödeme isteğinde bile 403 alır (route seviyesinde requireRole)', async () => {
        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ OrderId: 1, PaymentMethod: 'Cash', Amount: 10 });
        expect(res.status).toBe(403);
    });
});

describe('POST /api/payments - kalem bazlı (Items) tutar hesaplama', () => {
    test('Items ile gönderilen ödemede Amount client tarafından değil, DB deki UnitPrice x Quantity üzerinden hesaplanır', async () => {
        let insertedAmount = null;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM OrderDetails od')) {
                // getItemRemaining: kalem 1 -> 2 adet kaldı, birim fiyat 50
                return {
                    recordset: [
                        { OrderDetailsId: 1, ProductId: 10, Quantity: 2, UnitPrice: 50, PaidQuantity: 0, RemainingQuantity: 2 },
                    ],
                };
            }
            if (queryText.includes('INSERT INTO Payments')) {
                insertedAmount = inputs.Amount;
                return { recordset: [{ PaymentsId: 999 }] };
            }
            if (queryText.includes('INSERT INTO PaymentItems')) {
                return { recordset: [] };
            }
            if (queryText.includes('SUM(Amount - RefundAmount)')) {
                return { recordset: [{ NetPaid: 100, TotalDiscount: 0 }] };
            }
            if (queryText.includes('SELECT TableId, TotalAmount, Status FROM Orders')) {
                return { recordset: [{ TableId: 1, TotalAmount: 100, Status: 'Pending' }] };
            }
            if (queryText.includes("UPDATE Orders SET Status = 'Paid'")) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ OrderId: 1, PaymentMethod: 'Cash', Items: [{ OrderDetailsId: 1, Quantity: 2 }] });

        expect(res.status).toBe(201);
        // 2 adet x 50 birim fiyat = 100, client'tan Amount gönderilmedi
        expect(insertedAmount).toBe(100);
    });

    test('istenen adet kalan ödenmemiş adedi aşarsa 500 (işlem hata ile geri sarılır)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM OrderDetails od')) {
                return {
                    recordset: [
                        { OrderDetailsId: 1, ProductId: 10, Quantity: 2, UnitPrice: 50, PaidQuantity: 2, RemainingQuantity: 0 },
                    ],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/payments')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ OrderId: 1, PaymentMethod: 'Cash', Items: [{ OrderDetailsId: 1, Quantity: 1 }] });

        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/kalan ödenmemiş adedi/);
    });
});

describe('POST /api/payments/:id/refund', () => {
    test('Waiter/Cashier erişemez, sadece Admin (403)', async () => {
        const res = await request(app)
            .post('/api/payments/1/refund')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ RefundAmount: 10 });
        expect(res.status).toBe(403);
    });

    test('RefundAmount, ödeme tutarını aşarsa 500 döner (iş kuralı ihlali)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT OrderId, Amount, RefundAmount, IsDeleted FROM Payments')) {
                return { recordset: [{ OrderId: 1, Amount: 50, RefundAmount: 0, IsDeleted: false }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/payments/1/refund')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RefundAmount: 100 });

        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/ödeme tutarını aşamaz/);
    });

    test('RefundAmount 0 veya negatifse 400 döner', async () => {
        const res = await request(app)
            .post('/api/payments/1/refund')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RefundAmount: 0 });
        expect(res.status).toBe(400);
    });
});
