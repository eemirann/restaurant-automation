process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('../config/db');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function tokenFor(role, userId = 1) {
    return jwt.sign({ userId, userName: 'test', role }, process.env.JWT_SECRET);
}

const waiterToken = tokenFor('Waiter', 7);
const cashierToken = tokenFor('Cashier', 8);
const adminToken = tokenFor('Admin', 9);

afterEach(() => fakeDb.__reset());

// Kontrolörün ürettiği personel satırı (mssql recordset'i taklit eder).
function staffRow(overrides = {}) {
    return {
        UserId: 2,
        FullName: 'Ayşe Yılmaz',
        UserName: 'ayse',
        Role: 'Waiter',
        IsActive: true,
        OrderCount: 4,
        Revenue: 800,
        AvgBasket: 200,
        TopProductName: 'Latte',
        TopProductQuantity: 9,
        ...overrides,
    };
}

// staff-performance sorgusu WITH StaffOrders ... ile başlar; fakeDb query
// metnine göre eşleştirdiği için bu ifade ayırt edici anahtar olarak kullanılır.
function setStaffHandler(rows) {
    fakeDb.__setHandler(async (queryText, inputs) => {
        if (queryText.includes('WITH StaffOrders')) {
            return { recordset: rows, __inputs: inputs };
        }
        return { recordset: [] };
    });
}

describe('GET /api/reports/staff-performance', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/reports/staff-performance');
        expect(res.status).toBe(401);
    });

    test('Garson erişemez (403)', async () => {
        const res = await request(app)
            .get('/api/reports/staff-performance')
            .set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Kasiyer personel bazında sipariş sayısı, ciro ve ortalama sepeti görür', async () => {
        setStaffHandler([
            staffRow(),
            staffRow({ UserId: 3, FullName: 'Mehmet Demir', UserName: 'mehmet', OrderCount: 2, Revenue: 300, AvgBasket: 150, TopProductName: 'Çay', TopProductQuantity: 5 }),
        ]);

        const res = await request(app)
            .get('/api/reports/staff-performance?from=2026-07-01&to=2026-07-31')
            .set('Authorization', `Bearer ${cashierToken}`);

        expect(res.status).toBe(200);
        expect(res.body.range).toEqual({ from: '2026-07-01', to: '2026-07-31' });
        expect(res.body.staff).toHaveLength(2);
        expect(res.body.staff[0]).toMatchObject({
            UserId: 2,
            FullName: 'Ayşe Yılmaz',
            OrderCount: 4,
            Revenue: 800,
            AvgBasket: 200,
            TopProductName: 'Latte',
        });
    });

    test('Admin de erişebilir', async () => {
        setStaffHandler([staffRow()]);

        const res = await request(app)
            .get('/api/reports/staff-performance')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.staff).toHaveLength(1);
    });

    test('pasife alınmış personelin geçmiş performansı da döner (IsActive filtresi yok)', async () => {
        // İşten ayrılmış/pasife alınmış personel: IsActive = false ama tarih
        // aralığında satışı var — raporda GÖRÜNMELİ.
        setStaffHandler([
            staffRow({ UserId: 5, FullName: 'Ayrılmış Personel', UserName: 'eski', IsActive: false, OrderCount: 3, Revenue: 450, AvgBasket: 150 }),
            staffRow(),
        ]);

        const res = await request(app)
            .get('/api/reports/staff-performance?from=2026-07-01&to=2026-07-31')
            .set('Authorization', `Bearer ${cashierToken}`);

        expect(res.status).toBe(200);
        const passive = res.body.staff.find((s) => s.UserId === 5);
        expect(passive).toBeDefined();
        expect(passive.IsActive).toBe(false);
        expect(passive.Revenue).toBe(450);
        expect(passive.OrderCount).toBe(3);
    });

    test('sorgu Users tablosunu IsActive ile filtrelemez', async () => {
        let captured = '';
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('WITH StaffOrders')) {
                captured = queryText;
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        await request(app)
            .get('/api/reports/staff-performance')
            .set('Authorization', `Bearer ${cashierToken}`);

        expect(captured).toContain('JOIN Users u ON u.UserId = so.UserId');
        expect(captured).not.toMatch(/u\.IsActive\s*=\s*1/);
    });

    test('tarih aralığı sorguya @From/@To parametreleri olarak geçirilir', async () => {
        let captured = null;
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('WITH StaffOrders')) {
                captured = inputs;
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        await request(app)
            .get('/api/reports/staff-performance?from=2026-07-01&to=2026-07-31')
            .set('Authorization', `Bearer ${cashierToken}`);

        expect(captured).not.toBeNull();
        expect(new Date(captured.From).toISOString().slice(0, 10)).toBe('2026-07-01');
        expect(new Date(captured.To).toISOString().slice(0, 10)).toBe('2026-07-31');
    });

    test('from > to ise 400 döner', async () => {
        const res = await request(app)
            .get('/api/reports/staff-performance?from=2026-07-31&to=2026-07-01')
            .set('Authorization', `Bearer ${cashierToken}`);

        expect(res.status).toBe(400);
    });

    test('geçersiz tarih formatı 400 döner', async () => {
        const res = await request(app)
            .get('/api/reports/staff-performance?from=31-07-2026&to=2026-07-31')
            .set('Authorization', `Bearer ${cashierToken}`);

        expect(res.status).toBe(400);
    });

    test('format=csv CSV dosyası döner', async () => {
        setStaffHandler([staffRow()]);

        const res = await request(app)
            .get('/api/reports/staff-performance?from=2026-07-01&to=2026-07-31&format=csv')
            .set('Authorization', `Bearer ${cashierToken}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toContain('personel-performans-2026-07-01_2026-07-31.csv');
        expect(res.text).toContain('FullName');
        expect(res.text).toContain('Ayşe Yılmaz');
    });

    test('veritabanı hatasında 500 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('WITH StaffOrders')) {
                throw new Error('db patladı');
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .get('/api/reports/staff-performance')
            .set('Authorization', `Bearer ${cashierToken}`);

        expect(res.status).toBe(500);
    });
});
