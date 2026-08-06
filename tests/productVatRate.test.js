// Ürün oluşturma/güncellemede VatRate doğrulaması.
// (Genel ürün CRUD'u için ayrı bir test dosyası yok — bu dosya sadece
// bu geçişte eklenen VatRate alanına odaklanır.)
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

const validBody = () => ({ Name: 'Test Ürün', Price: 50, CategoryId: 1 });

afterEach(() => fakeDb.__reset());

describe('POST /api/products — VatRate doğrulaması', () => {
    test('VatRate gönderilmezse (NULL) 201 — genel orana düşer', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('INSERT INTO Products')) {
                return { recordset: [{ ProductId: 1, ...validBody(), VatRate: inputs.VatRate }] };
            }
            return { recordset: [] };
        });
        const res = await request(app).post('/api/products').set('Authorization', `Bearer ${adminToken}`).send(validBody());
        expect(res.status).toBe(201);
        expect(res.body.VatRate).toBeNull();
    });

    test('geçerli VatRate (ör. %20) kabul edilir', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('INSERT INTO Products')) {
                return { recordset: [{ ProductId: 1, ...validBody(), VatRate: inputs.VatRate }] };
            }
            return { recordset: [] };
        });
        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...validBody(), VatRate: 20 });
        expect(res.status).toBe(201);
        expect(res.body.VatRate).toBe(20);
    });

    test('100\'den büyük VatRate 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...validBody(), VatRate: 101 });
        expect(res.status).toBe(400);
    });

    test('negatif VatRate 400', async () => {
        const res = await request(app)
            .post('/api/products')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...validBody(), VatRate: -5 });
        expect(res.status).toBe(400);
    });
});

describe('PUT /api/products/:id — VatRate doğrulaması', () => {
    test('geçersiz VatRate 400', async () => {
        const res = await request(app)
            .put('/api/products/1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...validBody(), VatRate: 150 });
        expect(res.status).toBe(400);
    });

    test('geçerli VatRate ile güncelleme 200', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('UPDATE Products')) {
                return { recordset: [{ ProductId: 1, ...validBody(), VatRate: inputs.VatRate }] };
            }
            return { recordset: [] };
        });
        const res = await request(app)
            .put('/api/products/1')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...validBody(), VatRate: 1 });
        expect(res.status).toBe(200);
        expect(res.body.VatRate).toBe(1);
    });
});
