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
const adminToken = tokenFor('Admin');

afterEach(() => fakeDb.__reset());

describe('GET /api/syrups', () => {
    test('giriş yapmış herkes şurup listesini görebilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('WHERE p.IsSyrup = 1')) {
                return { recordset: [{ ProductId: 60, Name: 'Vanilya', Price: 3, IsActive: true, StockQuantity: 100, MinStockLevel: 5 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/syrups').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].Name).toBe('Vanilya');
    });

    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/syrups');
        expect(res.status).toBe(401);
    });
});

describe('POST /api/syrups', () => {
    test('Admin olmayan rol oluşturamaz (403)', async () => {
        const res = await request(app)
            .post('/api/syrups')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ Name: 'Karamel', Price: 3 });
        expect(res.status).toBe(403);
    });

    test('isim eksikse 400 döner', async () => {
        const res = await request(app)
            .post('/api/syrups')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Price: 3 });
        expect(res.status).toBe(400);
    });

    test('negatif fiyat 400 döner', async () => {
        const res = await request(app)
            .post('/api/syrups')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Name: 'Karamel', Price: -1 });
        expect(res.status).toBe(400);
    });

    test('Admin geçerli veriyle şurup oluşturabilir, IsSyrup=1 ve IsRawMaterial=0 ile eklenir', async () => {
        let inserted = null;
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes("FROM Categories WHERE Name = 'Şurup'")) {
                return { recordset: [{ CategoryId: 15 }] };
            }
            if (queryText.includes('INSERT INTO Products')) {
                inserted = { queryText, inputs };
                return { recordset: [{ ProductId: 61, Name: inputs.Name, Price: inputs.Price, IsActive: true }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/syrups')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Name: 'Karamel', Price: 3 });

        expect(res.status).toBe(201);
        expect(inserted.queryText).toMatch(/IsSyrup/);
        expect(inserted.inputs.Name).toBe('Karamel');
        expect(inserted.inputs.Price).toBe(3);
    });

    test('"Şurup" kategorisi yoksa (migration çalıştırılmamış) 500 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes("FROM Categories WHERE Name = 'Şurup'")) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/syrups')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Name: 'Karamel', Price: 3 });

        expect(res.status).toBe(500);
    });
});

describe('DELETE /api/syrups/:id', () => {
    test('Admin olmayan rol silemez (403)', async () => {
        const res = await request(app).delete('/api/syrups/1').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('bulunamayan şurup 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).delete('/api/syrups/999').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });
});
