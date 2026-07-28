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

afterEach(() => fakeDb.__reset());

const baseBody = { OrderId: 100, ToTableId: 2, TransferType: 'Move' };

describe('POST /api/tables/:tableId/transfer — doğrulama', () => {
    test('zorunlu alanlar eksikse 400 döner', async () => {
        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ OrderId: 100 });
        expect(res.status).toBe(400);
    });

    test("TransferType 'Move'/'Merge' dışındaysa 400 döner", async () => {
        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ ...baseBody, TransferType: 'Teleport' });
        expect(res.status).toBe(400);
    });

    test('kaynak ve hedef masa aynıysa 400 döner', async () => {
        const res = await request(app)
            .post('/api/tables/2/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ ...baseBody, ToTableId: 2 });
        expect(res.status).toBe(400);
    });

    test('sipariş bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(baseBody);
        expect(res.status).toBe(404);
    });

    test('sipariş belirtilen kaynak masaya ait değilse 400 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [{ OrderId: 100, TableId: 99, Status: 'Pending', TotalAmount: 50 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(baseBody);
        expect(res.status).toBe(400);
    });

    test("sipariş 'Paid' durumundaysa taşınamaz (400)", async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [{ OrderId: 100, TableId: 1, Status: 'Paid', TotalAmount: 50 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(baseBody);
        expect(res.status).toBe(400);
    });

    test('hedef masa bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [{ OrderId: 100, TableId: 1, Status: 'Pending', TotalAmount: 50 }] };
            }
            if (queryText.includes('SELECT TableId, Status FROM Tables WHERE TableId = @ToTableId')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(baseBody);
        expect(res.status).toBe(404);
    });
});

describe('POST /api/tables/:tableId/transfer — Move', () => {
    test('hedef masada aktif sipariş varsa 409 döner (Merge kullanılmalı uyarısı)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [{ OrderId: 100, TableId: 1, Status: 'Pending', TotalAmount: 50 }] };
            }
            if (queryText.includes('SELECT TableId, Status FROM Tables WHERE TableId = @ToTableId')) {
                return { recordset: [{ TableId: 2, Status: 'Occupied' }] };
            }
            if (queryText.includes("WHERE TableId = @ToTableId AND Status NOT IN")) {
                return { recordset: [{ OrderId: 200, TotalAmount: 30 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(baseBody);
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Merge/);
    });

    test('hedef masa boşsa sipariş başarıyla taşınır (200) ve TableTransferLog Move olarak kaydedilir', async () => {
        let loggedTransferType = null;
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [{ OrderId: 100, TableId: 1, Status: 'Pending', TotalAmount: 50 }] };
            }
            if (queryText.includes('SELECT TableId, Status FROM Tables WHERE TableId = @ToTableId')) {
                return { recordset: [{ TableId: 2, Status: 'Empty' }] };
            }
            if (queryText.includes('WHERE TableId = @ToTableId AND Status NOT IN')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO TableTransferLog')) {
                loggedTransferType = inputs.TransferType;
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(baseBody);
        expect(res.status).toBe(200);
        expect(res.body.orderId).toBe(100);
        expect(loggedTransferType).toBe('Move');
    });
});

describe('POST /api/tables/:tableId/transfer — Merge', () => {
    const mergeBody = { ...baseBody, TransferType: 'Merge' };

    test('hedef masada aktif sipariş yoksa merge yapılamaz (400)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [{ OrderId: 100, TableId: 1, Status: 'Pending', TotalAmount: 50 }] };
            }
            if (queryText.includes('SELECT TableId, Status FROM Tables WHERE TableId = @ToTableId')) {
                return { recordset: [{ TableId: 2, Status: 'Empty' }] };
            }
            if (queryText.includes('WHERE TableId = @ToTableId AND Status NOT IN')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(mergeBody);
        expect(res.status).toBe(400);
    });

    test('aynı üründe fiyat uyuşmazlığı varsa merge iptal edilir (409)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [{ OrderId: 100, TableId: 1, Status: 'Pending', TotalAmount: 50 }] };
            }
            if (queryText.includes('SELECT TableId, Status FROM Tables WHERE TableId = @ToTableId')) {
                return { recordset: [{ TableId: 2, Status: 'Occupied' }] };
            }
            if (queryText.includes('WHERE TableId = @ToTableId AND Status NOT IN')) {
                return { recordset: [{ OrderId: 200, TotalAmount: 30 }] };
            }
            if (queryText.includes('SELECT OrderDetailsId, ProductId, Quantity, UnitPrice, VariantId, Note FROM OrderDetails WHERE OrderId = @OrderId')) {
                return { recordset: [{ OrderDetailsId: 1, ProductId: 5, Quantity: 1, UnitPrice: 20, VariantId: null, Note: null }] };
            }
            if (queryText.includes('ISNULL(VariantId, -1) = ISNULL(@VariantId, -1)')) {
                return { recordset: [{ OrderDetailsId: 2, Quantity: 2, UnitPrice: 25, Note: null }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(mergeBody);
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/fiyat uyuşmazlığı/);
    });

    test('aynı ürün/varyant/not eşleşince miktarlar toplanır ve merge başarıyla tamamlanır (200)', async () => {
        let statusUpdatedTo = null;
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderId')) {
                return { recordset: [{ OrderId: 100, TableId: 1, Status: 'Pending', TotalAmount: 50 }] };
            }
            if (queryText.includes('SELECT TableId, Status FROM Tables WHERE TableId = @ToTableId')) {
                return { recordset: [{ TableId: 2, Status: 'Occupied' }] };
            }
            if (queryText.includes('WHERE TableId = @ToTableId AND Status NOT IN')) {
                return { recordset: [{ OrderId: 200, TotalAmount: 30 }] };
            }
            if (queryText.includes('SELECT OrderDetailsId, ProductId, Quantity, UnitPrice, VariantId, Note FROM OrderDetails WHERE OrderId = @OrderId')) {
                return { recordset: [{ OrderDetailsId: 1, ProductId: 5, Quantity: 1, UnitPrice: 20, VariantId: null, Note: null }] };
            }
            if (queryText.includes('ISNULL(VariantId, -1) = ISNULL(@VariantId, -1)')) {
                return { recordset: [{ OrderDetailsId: 2, Quantity: 2, UnitPrice: 20, Note: null }] };
            }
            if (queryText.includes("SELECT SUM(Quantity * UnitPrice) AS NewTotal")) {
                return { recordset: [{ NewTotal: 60 }] };
            }
            if (queryText.includes("UPDATE Orders SET Status = 'Merged'")) {
                statusUpdatedTo = 'Merged';
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/tables/1/transfer')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(mergeBody);
        expect(res.status).toBe(200);
        expect(res.body.mergedIntoOrderId).toBe(200);
        expect(statusUpdatedTo).toBe('Merged');
    });
});
