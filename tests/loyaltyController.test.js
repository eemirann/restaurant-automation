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
const cashierToken = tokenFor('Cashier', 8);
const adminToken = tokenFor('Admin', 1);

afterEach(() => fakeDb.__reset());

describe('GET /api/loyalty — müşteri listesi', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/loyalty');
        expect(res.status).toBe(401);
    });

    test('Waiter rolü 403 döner (sadece Admin+Cashier)', async () => {
        const res = await request(app).get('/api/loyalty').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Cashier tüm müşterileri listeleyebilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Customers')) {
                return {
                    recordset: [
                        { CustomerId: 1, Username: 'ahmet', LoyaltyPoints: 120, CreatedAt: '2026-08-01T00:00:00.000Z' },
                        { CustomerId: 2, Username: 'zeynep', LoyaltyPoints: 40, CreatedAt: '2026-08-02T00:00:00.000Z' },
                    ],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/loyalty').set('Authorization', `Bearer ${cashierToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].Username).toBe('ahmet');
    });

    test('search parametresi WHERE Username LIKE sorgusuna girer', async () => {
        let capturedQuery = '';
        let capturedInputs = null;
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM Customers')) {
                capturedQuery = queryText;
                capturedInputs = inputs;
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        await request(app).get('/api/loyalty').query({ search: 'ahmet', sort: 'points' }).set('Authorization', `Bearer ${adminToken}`);

        expect(capturedQuery).toContain('WHERE Username LIKE @Search');
        expect(capturedQuery).toContain('ORDER BY LoyaltyPoints DESC');
        expect(capturedInputs.Search).toBe('%ahmet%');
    });

    test('sort=username -> ORDER BY Username ASC', async () => {
        let capturedQuery = '';
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Customers')) {
                capturedQuery = queryText;
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        await request(app).get('/api/loyalty').query({ sort: 'username' }).set('Authorization', `Bearer ${adminToken}`);
        expect(capturedQuery).toContain('ORDER BY Username ASC');
    });
});
