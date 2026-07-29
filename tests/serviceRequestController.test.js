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

describe('GET /api/service-requests', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/service-requests');
        expect(res.status).toBe(401);
    });

    test('bekleyen istekleri masa bilgisiyle listeler', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM ServiceRequests sr')) {
                return { recordset: [{ ServiceRequestId: 1, TableId: 4, TableNumber: 4, Type: 'CallWaiter', Status: 'Pending', CreatedAt: new Date().toISOString() }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/service-requests?status=Pending').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].Type).toBe('CallWaiter');
    });
});

describe('PATCH /api/service-requests/:id/resolve', () => {
    test('istek bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).patch('/api/service-requests/1/resolve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(404);
    });

    test('zaten çözümlenmiş istek tekrar çözümlenemez (400)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ServiceRequestId, Status FROM ServiceRequests')) {
                return { recordset: [{ ServiceRequestId: 1, Status: 'Resolved' }] };
            }
            return { recordset: [] };
        });
        const res = await request(app).patch('/api/service-requests/1/resolve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(400);
    });

    test('bekleyen istek çözümlenebilir (200)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ServiceRequestId, Status FROM ServiceRequests')) {
                return { recordset: [{ ServiceRequestId: 1, Status: 'Pending' }] };
            }
            return { recordset: [] };
        });
        const res = await request(app).patch('/api/service-requests/1/resolve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(200);
    });
});
