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

describe('GET /api/products/export', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/products/export');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).get('/api/products/export').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Admin menü verisini dışa aktarabilir — ImageUrl/Stock.Quantity dahil edilmez, boolean alanlar coerce edilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Categories')) {
                return { recordset: [{ Name: 'İçecekler', IsActive: 1 }] };
            }
            if (queryText.includes('FROM Products p') && queryText.includes('LEFT JOIN Categories')) {
                return { recordset: [{ Name: 'Latte', Description: null, Price: 50, CategoryName: 'İçecekler', IsExtra: 0, IsSyrup: 0, IsPopular: 1, Barcode: null, LoyaltyPointCost: null, IsActive: 1, IsAvailable: 1, IsRawMaterial: 0, Cost: null, StockCount: null }] };
            }
            if (queryText.includes('FROM ProductVariants')) return { recordset: [] };
            if (queryText.includes('FROM ProductExtras')) return { recordset: [] };
            if (queryText.includes('FROM ProductSyrups')) return { recordset: [] };
            if (queryText.includes('FROM Recipes')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app).get('/api/products/export').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.categories).toEqual([{ Name: 'İçecekler', IsActive: true }]);
        expect(res.body.products).toHaveLength(1);
        expect(res.body.products[0].IsPopular).toBe(true);
        expect(res.body.products[0]).not.toHaveProperty('ImageUrl');
        expect(res.body.products[0]).not.toHaveProperty('Quantity');
        expect(typeof res.body.note).toBe('string');
        expect(res.body.exportedAt).toBeDefined();
    });
});

describe('POST /api/products/import', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).post('/api/products/import').send({});
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).post('/api/products/import').set('Authorization', `Bearer ${waiterToken}`).send({});
        expect(res.status).toBe(403);
    });

    test('isme göre eşleştirme: var olan kategori/ürün güncellenir, yeni ürün oluşturulur', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT CategoryId FROM Categories WHERE Name')) {
                if (inputs.Name === 'İçecekler') return { recordset: [{ CategoryId: 1 }] };
                return { recordset: [] };
            }
            if (queryText.includes('UPDATE Categories SET IsActive')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO Categories')) {
                return { recordset: [{ CategoryId: 2 }] };
            }
            if (queryText.includes('SELECT ProductId FROM Products WHERE Name')) {
                if (inputs.Name === 'Latte') return { recordset: [{ ProductId: 10 }] };
                return { recordset: [] };
            }
            if (queryText.includes('UPDATE Products SET Description')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO Products')) {
                return { recordset: [{ ProductId: 99 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/products/import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                categories: [{ Name: 'İçecekler', IsActive: true }],
                products: [
                    { Name: 'Latte', Price: 50, CategoryName: 'İçecekler', IsActive: true },
                    { Name: 'Yeni Ürün', Price: 30, CategoryName: 'İçecekler' },
                ],
            });

        expect(res.status).toBe(200);
        expect(res.body.categoriesCreated).toBe(0);
        expect(res.body.categoriesUpdated).toBe(1);
        expect(res.body.productsUpdated).toBe(1); // Latte -> var olan #10
        expect(res.body.productsCreated).toBe(1); // Yeni Ürün -> yeni
        expect(res.body.warnings).toEqual([]);
    });

    test('aynı JSON iki kez içe aktarılırsa idempotent kalır (ikinci seferde de güncelleme sayılır, yeni kayıt oluşmaz)', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT CategoryId FROM Categories WHERE Name')) {
                return { recordset: [{ CategoryId: 1 }] }; // her zaman var
            }
            if (queryText.includes('UPDATE Categories SET IsActive')) return { recordset: [] };
            if (queryText.includes('SELECT ProductId FROM Products WHERE Name')) {
                return inputs.Name === 'Latte' ? { recordset: [{ ProductId: 10 }] } : { recordset: [] };
            }
            if (queryText.includes('UPDATE Products SET Description')) return { recordset: [] };
            return { recordset: [] };
        });

        const payload = { categories: [{ Name: 'İçecekler', IsActive: true }], products: [{ Name: 'Latte', Price: 50, CategoryName: 'İçecekler' }] };

        const res1 = await request(app).post('/api/products/import').set('Authorization', `Bearer ${adminToken}`).send(payload);
        const res2 = await request(app).post('/api/products/import').set('Authorization', `Bearer ${adminToken}`).send(payload);

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);
        expect(res1.body).toEqual(res2.body);
        expect(res1.body.productsCreated).toBe(0);
        expect(res1.body.productsUpdated).toBe(1);
    });

    test('bulunamayan bir RawMaterialProductName işlem DURMADAN warning üretir', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT ProductId FROM Products WHERE Name')) {
                if (inputs.Name === 'Cheesecake') return { recordset: [] }; // yeni ürün
                if (inputs.Name === 'Hayali Hammadde') return { recordset: [] }; // bulunamıyor
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO Products')) {
                return { recordset: [{ ProductId: 5 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/products/import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                products: [{ Name: 'Cheesecake', Price: 40 }],
                recipes: [{ ProductName: 'Cheesecake', RawMaterialProductName: 'Hayali Hammadde', Quantity: 0.2, Unit: 'kg' }],
            });

        expect(res.status).toBe(200);
        expect(res.body.productsCreated).toBe(1);
        expect(res.body.warnings).toHaveLength(1);
        expect(res.body.warnings[0]).toContain('Hayali Hammadde');
    });
});
