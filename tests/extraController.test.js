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

describe('GET /api/extras', () => {
    test('giriş yapmış herkes ekstra listesini görebilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('WHERE p.IsExtra = 1')) {
                return { recordset: [{ ProductId: 50, Name: 'Ekstra Shot', Price: 5, IsActive: true, StockQuantity: 100, MinStockLevel: 5 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/extras').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].Name).toBe('Ekstra Shot');
    });

    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/extras');
        expect(res.status).toBe(401);
    });
});

describe('POST /api/extras', () => {
    test('Admin olmayan rol oluşturamaz (403)', async () => {
        const res = await request(app)
            .post('/api/extras')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ Name: 'Ekstra Çikolata', Price: 8 });
        expect(res.status).toBe(403);
    });

    test('isim eksikse 400 döner', async () => {
        const res = await request(app)
            .post('/api/extras')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Price: 8 });
        expect(res.status).toBe(400);
    });

    test('negatif fiyat 400 döner', async () => {
        const res = await request(app)
            .post('/api/extras')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Name: 'Ekstra Çikolata', Price: -1 });
        expect(res.status).toBe(400);
    });

    test('Admin geçerli veriyle ekstra oluşturabilir, IsExtra=1 ve IsRawMaterial=0 ile eklenir', async () => {
        let inserted = null;
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes("FROM Categories WHERE Name = 'Ekstra'")) {
                return { recordset: [{ CategoryId: 14 }] };
            }
            if (queryText.includes('INSERT INTO Products')) {
                inserted = { queryText, inputs };
                return { recordset: [{ ProductId: 51, Name: inputs.Name, Price: inputs.Price, IsActive: true }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/extras')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Name: 'Ekstra Çikolata', Price: 8 });

        expect(res.status).toBe(201);
        expect(inserted.queryText).toMatch(/IsExtra/);
        expect(inserted.inputs.Name).toBe('Ekstra Çikolata');
        expect(inserted.inputs.Price).toBe(8);
    });

    test('"Ekstra" kategorisi yoksa (migration çalıştırılmamış) 500 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes("FROM Categories WHERE Name = 'Ekstra'")) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/extras')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Name: 'Ekstra Çikolata', Price: 8 });

        expect(res.status).toBe(500);
    });
});

describe('DELETE /api/extras/:id', () => {
    test('Admin olmayan rol silemez (403)', async () => {
        const res = await request(app).delete('/api/extras/1').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('bulunamayan ekstra 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).delete('/api/extras/999').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });
});
