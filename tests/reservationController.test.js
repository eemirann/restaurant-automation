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

const validBody = {
    TableId: 4,
    CustomerName: 'Ahmet Yılmaz',
    CustomerPhone: '05551112233',
    PartySize: 2,
    ReservationTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
};

describe('GET /api/reservations', () => {
    test('giriş yapmış herkes (Garson dahil) rezervasyonları görebilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Reservations WHERE 1=1')) {
                return { recordset: [{ ReservationId: 1, TableId: 4, CustomerName: 'Ahmet', Status: 'Active' }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/reservations').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/reservations');
        expect(res.status).toBe(401);
    });
});

describe('POST /api/reservations', () => {
    test('Garson rezervasyon oluşturamaz (403)', async () => {
        const res = await request(app)
            .post('/api/reservations')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send(validBody);
        expect(res.status).toBe(403);
    });

    test('zorunlu alanlar eksikse 400 döner', async () => {
        const res = await request(app)
            .post('/api/reservations')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ TableId: 4 });
        expect(res.status).toBe(400);
    });

    test('PartySize pozitif tam sayı değilse 400 döner', async () => {
        const res = await request(app)
            .post('/api/reservations')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ ...validBody, PartySize: 0 });
        expect(res.status).toBe(400);
    });

    test('ReservationTime geçersiz bir tarihse 400 döner', async () => {
        const res = await request(app)
            .post('/api/reservations')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send({ ...validBody, ReservationTime: 'gecersiz-tarih' });
        expect(res.status).toBe(400);
    });

    test('masa bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT TableId FROM Tables WHERE TableId')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/reservations')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send(validBody);
        expect(res.status).toBe(404);
    });

    test('aynı masada çakışan aktif rezervasyon varsa 409 döner (çifte rezervasyon koruması)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT TableId FROM Tables WHERE TableId')) {
                return { recordset: [{ TableId: 4 }] };
            }
            if (queryText.includes('ABS(DATEDIFF(MINUTE')) {
                return { recordset: [{ ReservationId: 9, CustomerName: 'Mevcut Müşteri', ReservationTime: validBody.ReservationTime }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/reservations')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send(validBody);
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/aktif rezervasyon/);
    });

    test('Kasiyer geçerli veriyle rezervasyon oluşturabilir (201)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT TableId FROM Tables WHERE TableId')) {
                return { recordset: [{ TableId: 4 }] };
            }
            if (queryText.includes('ABS(DATEDIFF(MINUTE')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO Reservations')) {
                return {
                    recordset: [{
                        ReservationId: 10, TableId: 4, CustomerName: validBody.CustomerName,
                        CustomerPhone: validBody.CustomerPhone, PartySize: 2,
                        ReservationTime: validBody.ReservationTime, Note: null, Status: 'Active', CreatedAt: new Date().toISOString(),
                    }],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/reservations')
            .set('Authorization', `Bearer ${cashierToken}`)
            .send(validBody);
        expect(res.status).toBe(201);
        expect(res.body.reservation.ReservationId).toBe(10);
        expect(res.body.reservation.Status).toBe('Active');
    });
});

describe('PATCH /api/reservations/:id/cancel', () => {
    test('Garson rezervasyon iptal edemez (403)', async () => {
        const res = await request(app)
            .patch('/api/reservations/1/cancel')
            .set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('bulunamayan rezervasyon 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app)
            .patch('/api/reservations/999/cancel')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });

    test('zaten iptal/expired olan rezervasyon tekrar iptal edilemez (400)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ReservationId, Status FROM Reservations')) {
                return { recordset: [{ ReservationId: 1, Status: 'Cancelled' }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .patch('/api/reservations/1/cancel')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
    });

    test('Admin aktif rezervasyonu iptal edebilir (200)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ReservationId, Status FROM Reservations')) {
                return { recordset: [{ ReservationId: 1, Status: 'Active' }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .patch('/api/reservations/1/cancel')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
    });
});
