process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('./helpers/fakeDb');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function tokenFor(role, userId = 1) {
    return jwt.sign({ userId, userName: 'test', role }, process.env.JWT_SECRET);
}

const waiterToken = tokenFor('Waiter', 7);
const adminToken = tokenFor('Admin', 1);

afterEach(() => fakeDb.__reset());

describe('GET /api/logs/recent', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/logs/recent');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).get('/api/logs/recent').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Admin teknik logları listeleyebilir (log dosyası yoksa boş dizi)', async () => {
        const res = await request(app).get('/api/logs/recent').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
