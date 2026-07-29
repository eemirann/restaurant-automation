process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('../config/db');

const request = require('supertest');
const app = require('../server');

afterEach(() => fakeDb.__reset());

const TOKEN = 'abcd1234abcd1234abcd1234abcd1234';

describe('GET /api/public/menu/:qrToken', () => {
    test('token yoksa (kimlik doğrulama gerektirmez) 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app).get(`/api/public/menu/${TOKEN}`);
        expect(res.status).toBe(404);
    });

    test('geçerli token ile giriş yapmadan menü görüntülenebilir (200)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) {
                return { recordset: [{ TableId: 12, TableNumber: 12, Area: 'Salon', Status: 'Occupied' }] };
            }
            if (queryText.includes('FROM Categories WHERE IsActive')) {
                return { recordset: [{ CategoryId: 1, Name: 'Kahveler' }] };
            }
            if (queryText.includes('FROM Products')) {
                return { recordset: [{ ProductId: 5, Name: 'Latte', Price: 85, CategoryId: 1 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get(`/api/public/menu/${TOKEN}`);
        expect(res.status).toBe(200);
        expect(res.body.table.TableNumber).toBe(12);
        expect(res.body.products).toHaveLength(1);
    });
});

describe('POST /api/public/menu/:qrToken/order', () => {
    test('Items eksikse 400 döner', async () => {
        const res = await request(app).post(`/api/public/menu/${TOKEN}/order`).send({});
        expect(res.status).toBe(400);
    });

    test('geçersiz ProductId/Quantity içeren item 400 döner', async () => {
        const res = await request(app)
            .post(`/api/public/menu/${TOKEN}/order`)
            .send({ Items: [{ ProductId: 'abc', Quantity: 0 }] });
        expect(res.status).toBe(400);
    });

    test('masa bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app)
            .post(`/api/public/menu/${TOKEN}/order`)
            .send({ Items: [{ ProductId: 5, Quantity: 1 }] });
        expect(res.status).toBe(404);
    });

    test('ürün aktif/satılabilir değilse 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) {
                return { recordset: [{ TableId: 12, TableNumber: 12, Area: 'Salon', Status: 'Occupied' }] };
            }
            if (queryText.includes('FROM Products WHERE ProductId = @ProductId AND IsActive')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post(`/api/public/menu/${TOKEN}/order`)
            .send({ Items: [{ ProductId: 5, Quantity: 1 }] });
        expect(res.status).toBe(404);
    });

    test('geçerli sipariş isteği oluşturulabilir (201), Orders/OrderDetails\'e hiç yazılmaz', async () => {
        let insertedIntoOrders = false;
        let insertedRequestId = null;

        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) {
                return { recordset: [{ TableId: 12, TableNumber: 12, Area: 'Salon', Status: 'Occupied' }] };
            }
            if (queryText.includes('FROM Products WHERE ProductId = @ProductId AND IsActive')) {
                return { recordset: [{ ProductId: 5 }] };
            }
            if (queryText.includes('INSERT INTO CustomerOrderRequests')) {
                insertedRequestId = 77;
                return { recordset: [{ CustomerOrderRequestId: 77, CreatedAt: new Date().toISOString() }] };
            }
            if (queryText.includes('INSERT INTO CustomerOrderRequestItems')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedIntoOrders = true;
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post(`/api/public/menu/${TOKEN}/order`)
            .send({ Items: [{ ProductId: 5, Quantity: 2, Extras: [{ ExtraProductId: 9, Quantity: 1 }] }] });

        expect(res.status).toBe(201);
        expect(res.body.requestId).toBe(77);
        expect(insertedRequestId).toBe(77);
        expect(insertedIntoOrders).toBe(false);
    });
});

describe('POST /api/public/menu/:qrToken/request', () => {
    test('geçersiz Type 400 döner', async () => {
        const res = await request(app)
            .post(`/api/public/menu/${TOKEN}/request`)
            .send({ Type: 'DemandFreeMeal' });
        expect(res.status).toBe(400);
    });

    test('masa bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app)
            .post(`/api/public/menu/${TOKEN}/request`)
            .send({ Type: 'CallWaiter' });
        expect(res.status).toBe(404);
    });

    test('aynı tipte bekleyen istek varsa yenisi oluşturulmaz, mevcut döner (spam koruması)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) {
                return { recordset: [{ TableId: 12, TableNumber: 12, Area: 'Salon', Status: 'Occupied' }] };
            }
            if (queryText.includes("Type = @Type AND Status = 'Pending'")) {
                return { recordset: [{ ServiceRequestId: 3, CreatedAt: new Date().toISOString() }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post(`/api/public/menu/${TOKEN}/request`)
            .send({ Type: 'CallWaiter' });
        expect(res.status).toBe(200);
        expect(res.body.alreadyPending).toBe(true);
        expect(res.body.requestId).toBe(3);
    });

    test('yeni istek başarıyla oluşturulur (201)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) {
                return { recordset: [{ TableId: 12, TableNumber: 12, Area: 'Salon', Status: 'Occupied' }] };
            }
            if (queryText.includes("Type = @Type AND Status = 'Pending'")) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO ServiceRequests')) {
                return { recordset: [{ ServiceRequestId: 8, CreatedAt: new Date().toISOString() }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post(`/api/public/menu/${TOKEN}/request`)
            .send({ Type: 'AskForWater' });
        expect(res.status).toBe(201);
        expect(res.body.requestId).toBe(8);
    });
});

describe('GET /api/public/menu/:qrToken/status', () => {
    test('masa bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) return { recordset: [] };
            return { recordset: [] };
        });
        const res = await request(app).get(`/api/public/menu/${TOKEN}/status`);
        expect(res.status).toBe(404);
    });

    test('son sipariş isteği ve bekleyen hizmet istekleri döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Tables WHERE QrToken')) {
                return { recordset: [{ TableId: 12, TableNumber: 12, Area: 'Salon', Status: 'Occupied' }] };
            }
            if (queryText.includes('FROM CustomerOrderRequests')) {
                return { recordset: [{ CustomerOrderRequestId: 77, Status: 'Pending', RejectionReason: null, ApprovedOrderId: null }] };
            }
            if (queryText.includes('FROM ServiceRequests')) {
                return { recordset: [{ ServiceRequestId: 8, Type: 'AskForWater' }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get(`/api/public/menu/${TOKEN}/status`);
        expect(res.status).toBe(200);
        expect(res.body.lastOrderRequest.Status).toBe('Pending');
        expect(res.body.pendingServiceRequests).toHaveLength(1);
    });
});
