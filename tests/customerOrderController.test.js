process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('../config/db');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function tokenFor(role, userId = 1) {
    return jwt.sign({ userId, userName: 'test', role }, process.env.JWT_SECRET);
}

const waiterToken = tokenFor('Waiter', 7);

afterEach(() => fakeDb.__reset());

describe('GET /api/customer-orders', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/customer-orders');
        expect(res.status).toBe(401);
    });

    test('bekleyen istekleri kalemleriyle birlikte döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests r')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, TableNumber: 4, Note: null, Status: 'Pending', CreatedAt: new Date().toISOString() }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems i')) {
                return { recordset: [{ CustomerOrderRequestId: 1, ProductId: 5, ProductName: 'Latte', Quantity: 2, ExtrasJson: JSON.stringify([{ ExtraProductId: 9, Quantity: 1 }]), SyrupsJson: null }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/customer-orders?status=Pending').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].items).toHaveLength(1);
        expect(res.body[0].items[0].Extras).toEqual([{ ExtraProductId: 9, Quantity: 1 }]);
    });
});

describe('POST /api/customer-orders/:id/approve', () => {
    test('istek bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(404);
    });

    test('istek zaten onaylanmış/reddedilmişse 400 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Approved' }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(400);
    });

    test('onaylanınca ürün artık aktif değilse buildOrderInTransaction hatası 400 olarak döner ve istek Pending kalır', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Pending' }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [{ ProductId: 5, Quantity: 2, VariantId: null, Note: null, ExtrasJson: null, SyrupsJson: null }] };
            }
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 5, Price: 85, IsActive: false, IsAvailable: true }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(400);
    });

    test('geçerli istek onaylanınca gerçek sipariş oluşturulur (201) ve istek Approved işaretlenir', async () => {
        let updatedToApproved = false;
        let insertedOrderUserId = null;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM CustomerOrderRequests') && queryText.includes('UPDLOCK')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: 'Az şekerli', Status: 'Pending' }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [{ ProductId: 5, Quantity: 2, VariantId: null, Note: null, ExtrasJson: null, SyrupsJson: null }] };
            }
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 5, Price: 85, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedOrderUserId = inputs.UserId;
                return { recordset: [{ OrderId: 55, TableId: 4, UserId: inputs.UserId, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: inputs.Note, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] };
            }
            if (queryText.includes("UPDATE CustomerOrderRequests")) {
                updatedToApproved = true;
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(201);
        expect(res.body.order.OrderId).toBe(55);
        // Onaylayan personelin UserId'si siparişe atanır (waiterToken userId=7)
        expect(insertedOrderUserId).toBe(7);
        expect(updatedToApproved).toBe(true);
    });
});

describe('POST /api/customer-orders/:id/reject', () => {
    test('istek bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).post('/api/customer-orders/1/reject').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(404);
    });

    test('geçerli istek reddedilebilir (200), Orders\'a hiç dokunulmaz', async () => {
        let insertedIntoOrders = false;
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT CustomerOrderRequestId, Status FROM CustomerOrderRequests')) {
                return { recordset: [{ CustomerOrderRequestId: 1, Status: 'Pending' }] };
            }
            if (queryText.includes('INSERT INTO Orders')) insertedIntoOrders = true;
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/customer-orders/1/reject')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ Reason: 'Stokta yok' });
        expect(res.status).toBe(200);
        expect(insertedIntoOrders).toBe(false);
    });
});
