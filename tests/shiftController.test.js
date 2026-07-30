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

describe('GET /api/shifts — DurationMinutes ve IsDeleted filtresi', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/shifts');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).get('/api/shifts').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('varsayılan sorguda WHERE s.IsDeleted = 0 kullanılır ve DurationMinutes döner', async () => {
        let capturedQuery = '';
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Shifts s')) {
                capturedQuery = queryText;
                return { recordset: [{ ShiftId: 1, UserId: 2, UserName: 'kasiyer1', DurationMinutes: 135, IsDeleted: false }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/shifts').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(capturedQuery).toContain('DATEDIFF(MINUTE');
        expect(capturedQuery).toContain('WHERE s.IsDeleted = 0');
        expect(res.body[0].DurationMinutes).toBe(135);
    });

    test('?includeDeleted=1 ile WHERE filtresi uygulanmaz', async () => {
        let capturedQuery = '';
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Shifts s')) {
                capturedQuery = queryText;
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/shifts').query({ includeDeleted: '1' }).set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(capturedQuery).not.toContain('WHERE s.IsDeleted = 0');
    });
});

describe('PATCH /api/shifts/:id/delete', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).patch('/api/shifts/1/delete');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).patch('/api/shifts/1/delete').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('vardiya bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).patch('/api/shifts/999/delete').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });

    test('Admin vardiyayı soft-delete edebilir (IsDeleted=1) ve denetim kaydı yazılır', async () => {
        const auditInserts = [];
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('UPDATE Shifts SET IsDeleted = 1')) {
                return { recordset: [{ ShiftId: 5, UserId: 3, IsDeleted: true }] };
            }
            if (queryText.includes('INSERT INTO AuditLog')) {
                auditInserts.push(inputs);
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app).patch('/api/shifts/5/delete').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.IsDeleted).toBe(true);

        await new Promise((r) => setImmediate(r));
        expect(auditInserts).toHaveLength(1);
        expect(auditInserts[0].Action).toBe('SHIFT_DELETE');
    });
});

describe('PATCH /api/shifts/:id/restore', () => {
    test('vardiya bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).patch('/api/shifts/999/restore').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });

    test('Admin vardiyayı geri getirebilir (IsDeleted=0) ve denetim kaydı yazılır', async () => {
        const auditInserts = [];
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('UPDATE Shifts SET IsDeleted = 0')) {
                return { recordset: [{ ShiftId: 5, UserId: 3, IsDeleted: false }] };
            }
            if (queryText.includes('INSERT INTO AuditLog')) {
                auditInserts.push(inputs);
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app).patch('/api/shifts/5/restore').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.IsDeleted).toBe(false);

        await new Promise((r) => setImmediate(r));
        expect(auditInserts).toHaveLength(1);
        expect(auditInserts[0].Action).toBe('SHIFT_RESTORE');
    });
});
