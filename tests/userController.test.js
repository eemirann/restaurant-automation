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

describe('PATCH /api/users/:id/role', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).patch('/api/users/2/role').send({ Role: 'Cashier' });
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).patch('/api/users/2/role').set('Authorization', `Bearer ${waiterToken}`).send({ Role: 'Cashier' });
        expect(res.status).toBe(403);
    });

    test('geçersiz Role 400 döner', async () => {
        const res = await request(app).patch('/api/users/2/role').set('Authorization', `Bearer ${adminToken}`).send({ Role: 'Manager' });
        expect(res.status).toBe(400);
    });

    test('kullanıcı bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).patch('/api/users/999/role').set('Authorization', `Bearer ${adminToken}`).send({ Role: 'Cashier' });
        expect(res.status).toBe(404);
    });

    test('Admin rolü değiştirebilir ve denetim kaydı (best-effort) INSERT INTO AuditLog çağrısı yapılır', async () => {
        const auditInserts = [];
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT UserId, UserName, Role FROM Users')) {
                return { recordset: [{ UserId: 2, UserName: 'garson1', Role: 'Waiter' }] };
            }
            if (queryText.includes('UPDATE Users SET Role')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO AuditLog')) {
                auditInserts.push(inputs);
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app).patch('/api/users/2/role').set('Authorization', `Bearer ${adminToken}`).send({ Role: 'Cashier' });
        expect(res.status).toBe(200);
        expect(res.body.role).toBe('Cashier');

        // logAudit best-effort/fire-and-forget çalışır — event loop'un bir turunu bekle.
        await new Promise((r) => setImmediate(r));
        expect(auditInserts).toHaveLength(1);
        expect(auditInserts[0].Action).toBe('USER_ROLE_CHANGE');
        const details = JSON.parse(auditInserts[0].Details);
        expect(details).toEqual({ userName: 'garson1', oldRole: 'Waiter', newRole: 'Cashier' });
    });
});

describe('PATCH /api/users/:id/deactivate', () => {
    test('Admin kullanıcıyı pasife alabilir ve denetim kaydı yazılır', async () => {
        const auditInserts = [];
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT UserId, UserName, IsActive FROM Users')) {
                return { recordset: [{ UserId: 3, UserName: 'kasiyer1', IsActive: true }] };
            }
            if (queryText.includes('UPDATE Users SET IsActive = 0')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO AuditLog')) {
                auditInserts.push(inputs);
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app).patch('/api/users/3/deactivate').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);

        await new Promise((r) => setImmediate(r));
        expect(auditInserts).toHaveLength(1);
        expect(auditInserts[0].Action).toBe('USER_DEACTIVATE');
    });
});
