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

describe('GET /api/products/:id/options', () => {
    test('Admin olmayan rol göremez (403)', async () => {
        const res = await request(app)
            .get('/api/products/10/options')
            .set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Admin tam katalog + bu ürüne bağlı olanları Attached=1 ile görür', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('WHERE p.IsExtra = 1')) {
                return {
                    recordset: [
                        { ProductId: 50, Name: 'Ekstra Shot', Price: 5, IsActive: true, Attached: 1, IsEnabled: 1, DisplayOrder: 0 },
                        { ProductId: 51, Name: 'Yulaf Sütü', Price: 6, IsActive: true, Attached: 0, IsEnabled: 0, DisplayOrder: 0 },
                    ],
                };
            }
            if (queryText.includes('WHERE p.IsSyrup = 1')) {
                return { recordset: [{ ProductId: 60, Name: 'Vanilya', Price: 3, IsActive: true, Attached: 0, IsEnabled: 0, DisplayOrder: 0 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .get('/api/products/10/options')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.extras).toHaveLength(2);
        expect(res.body.extras.find((e) => e.ProductId === 50).Attached).toBe(1);
        expect(res.body.syrups).toHaveLength(1);
    });
});

describe('PUT /api/products/:id/options', () => {
    test('Admin olmayan rol kaydedemez (403)', async () => {
        const res = await request(app)
            .put('/api/products/10/options')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ Extras: [], Syrups: [] });
        expect(res.status).toBe(403);
    });

    test('Extras dizi değilse 400 döner', async () => {
        const res = await request(app)
            .put('/api/products/10/options')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Extras: 'not-an-array' });
        expect(res.status).toBe(400);
    });

    test('geçersiz alan tipleri (DisplayOrder eksik) 400 döner', async () => {
        const res = await request(app)
            .put('/api/products/10/options')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Extras: [{ ExtraProductId: 50, IsEnabled: true }] });
        expect(res.status).toBe(400);
    });

    test('ürün bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ProductId FROM Products WHERE ProductId = @Id')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .put('/api/products/999/options')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Extras: [], Syrups: [] });

        expect(res.status).toBe(404);
    });

    test('ExtraProductId olarak SQL enjeksiyonu denemesi içeren string gönderilirse 400 döner (typeof kontrolü reddeder)', async () => {
        const res = await request(app)
            .put('/api/products/10/options')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Extras: [{ ExtraProductId: '1); DROP TABLE Products;--', DisplayOrder: 0, IsEnabled: true }] });

        expect(res.status).toBe(400);
    });

    test('geçersiz ExtraProductId gönderilirse 400 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ProductId FROM Products WHERE ProductId = @Id')) {
                return { recordset: [{ ProductId: 10 }] };
            }
            if (queryText.includes('IsExtra = 1 AND ProductId IN')) {
                return { recordset: [] }; // 999 IsExtra=1 değil
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .put('/api/products/10/options')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Extras: [{ ExtraProductId: 999, DisplayOrder: 0, IsEnabled: true }] });

        expect(res.status).toBe(400);
    });

    test('attach/detach/reorder/enable tek istekte kaydedilir (tam değiştirme)', async () => {
        const deletes = [];
        const inserts = [];

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT ProductId FROM Products WHERE ProductId = @Id')) {
                return { recordset: [{ ProductId: 10 }] };
            }
            if (queryText.includes('IsExtra = 1 AND ProductId IN')) {
                return { recordset: [{ ProductId: 50 }, { ProductId: 51 }] };
            }
            if (queryText.includes('IsSyrup = 1 AND ProductId IN')) {
                return { recordset: [{ ProductId: 60 }] };
            }
            if (queryText.includes('DELETE FROM ProductExtras') || queryText.includes('DELETE FROM ProductSyrups')) {
                deletes.push(queryText);
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO ProductExtras') || queryText.includes('INSERT INTO ProductSyrups')) {
                inserts.push(inputs);
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .put('/api/products/10/options')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                Extras: [
                    { ExtraProductId: 50, DisplayOrder: 1, IsEnabled: true },
                    { ExtraProductId: 51, DisplayOrder: 0, IsEnabled: false },
                ],
                Syrups: [{ SyrupProductId: 60, DisplayOrder: 0, IsEnabled: true }],
            });

        expect(res.status).toBe(200);
        expect(deletes).toHaveLength(2);
        expect(inserts).toHaveLength(3);
        expect(inserts.find((i) => i.ExtraProductId === 51).IsEnabled).toBe(0);
    });
});

describe('GET /api/products/:id/order-options', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/products/10/order-options');
        expect(res.status).toBe(401);
    });

    test('sadece bu ürüne bağlı + etkin + aktif olan ekstra/şuruplar döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM ProductExtras')) {
                return { recordset: [{ ProductId: 50, Name: 'Ekstra Shot', Price: 5 }] };
            }
            if (queryText.includes('FROM ProductSyrups')) {
                return { recordset: [{ ProductId: 60, Name: 'Vanilya', Price: 3 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .get('/api/products/10/order-options')
            .set('Authorization', `Bearer ${waiterToken}`);

        expect(res.status).toBe(200);
        expect(res.body.extras).toEqual([{ ProductId: 50, Name: 'Ekstra Shot', Price: 5 }]);
        expect(res.body.syrups).toEqual([{ ProductId: 60, Name: 'Vanilya', Price: 3 }]);
    });
});
