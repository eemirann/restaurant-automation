process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('../config/db');

jest.mock('../config/socket', () => ({
    initSocket: jest.fn(),
    emitTablesChanged: jest.fn(),
    emitKitchen: jest.fn(),
    emitCustomerRequests: jest.fn(),
    emitStockAlert: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function tokenFor(role, userId = 1) {
    return jwt.sign({ userId, userName: 'test', role }, process.env.JWT_SECRET);
}

afterEach(() => {
    fakeDb.__reset();
});

describe('GET /api/kds/queue - görüntüleme herkese açık', () => {
    test('Garson kuyruğu görebilir (salt-okunur)', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app)
            .get('/api/kds/queue')
            .set('Authorization', `Bearer ${tokenFor('Waiter')}`);
        expect(res.status).toBe(200);
    });
});

describe('PATCH /api/kds/items/:id/status - yetki (Garson durum değiştiremez)', () => {
    test('Garson 403 alır', async () => {
        const res = await request(app)
            .patch('/api/kds/items/1/status')
            .set('Authorization', `Bearer ${tokenFor('Waiter')}`)
            .send({ PrepStatus: 'Ready' });
        expect(res.status).toBe(403);
    });

    test('Mutfak rolü durumu değiştirebilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('UPDATE OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1, OrderId: 10, PrepStatus: 'Ready', PreparedAt: new Date() }] };
            }
            return { recordset: [] };
        });
        const res = await request(app)
            .patch('/api/kds/items/1/status')
            .set('Authorization', `Bearer ${tokenFor('Kitchen')}`)
            .send({ PrepStatus: 'Ready' });
        expect(res.status).toBe(200);
        expect(res.body.PrepStatus).toBe('Ready');
    });

    test('Kasiyer ve Yönetici de durumu değiştirebilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('UPDATE OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1, OrderId: 10, PrepStatus: 'Served', PreparedAt: new Date() }] };
            }
            return { recordset: [] };
        });
        for (const role of ['Cashier', 'Admin']) {
            const res = await request(app)
                .patch('/api/kds/items/1/status')
                .set('Authorization', `Bearer ${tokenFor(role)}`)
                .send({ PrepStatus: 'Served' });
            expect(res.status).toBe(200);
        }
    });

    test('Geçersiz PrepStatus 400 döner (yetkili rol için)', async () => {
        const res = await request(app)
            .patch('/api/kds/items/1/status')
            .set('Authorization', `Bearer ${tokenFor('Kitchen')}`)
            .send({ PrepStatus: 'Invalid' });
        expect(res.status).toBe(400);
    });
});
