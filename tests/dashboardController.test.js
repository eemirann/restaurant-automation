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

function setFullDashboardHandler() {
    fakeDb.__setHandler(async (queryText) => {
        if (queryText.includes('TodayRevenue')) {
            return { recordset: [{ TodayRevenue: 500, TodayOrders: 10, OccupiedTables: 2, AvailableTables: 3, LowStockCount: 1, TotalProducts: 20, YesterdayOrders: 8, YesterdayOccupiedTables: 1 }] };
        }
        if (queryText.includes('PricedRevenue')) {
            return { recordset: [{ PricedRevenue: 500, PricedCost: 200, UnpricedQuantity: 0 }] };
        }
        if (queryText.includes('ComboOffers co')) {
            return { recordset: [{ ComboName: 'Kahve+Simit', QuantitySold: 12 }] };
        }
        if (queryText.includes('SELECT COUNT(*) AS LoyaltyCustomerCount')) {
            return { recordset: [{ LoyaltyCustomerCount: 5 }] };
        }
        if (queryText.includes('FreeProductCount')) {
            return { recordset: [{ FreeProductCount: 3, TotalPointsSpent: 150 }] };
        }
        if (queryText.includes('AvgTaste')) {
            return { recordset: [{ AvgTaste: 2.5, AvgService: 3, AvgCleanliness: 2, FeedbackCount: 4 }] };
        }
        return { recordset: [] };
    });
}

describe('GET /api/dashboard — kampanya/sadaklık analitiği', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/dashboard');
        expect(res.status).toBe(401);
    });

    test('en çok satılan combo, sadaklık ve anket alanları döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('TodayRevenue')) {
                return { recordset: [{ TodayRevenue: 0, TodayOrders: 0, OccupiedTables: 0, AvailableTables: 0, LowStockCount: 0, TotalProducts: 0 }] };
            }
            if (queryText.includes('PricedRevenue')) {
                return { recordset: [{ PricedRevenue: 0, PricedCost: 0, UnpricedQuantity: 0 }] };
            }
            if (queryText.includes('ComboOffers co')) {
                return { recordset: [{ ComboName: 'Kahve+Simit', QuantitySold: 12 }] };
            }
            if (queryText.includes('SELECT COUNT(*) AS LoyaltyCustomerCount')) {
                return { recordset: [{ LoyaltyCustomerCount: 5 }] };
            }
            if (queryText.includes('FreeProductCount')) {
                return { recordset: [{ FreeProductCount: 3, TotalPointsSpent: 150 }] };
            }
            if (queryText.includes('AvgTaste')) {
                return { recordset: [{ AvgTaste: 2.5, AvgService: 3, AvgCleanliness: 2, FeedbackCount: 4 }] };
            }
            return { recordset: [] };
        });

        // Cashier/Admin bu hassas alanları görebilir (Waiter göremez, bkz. aşağıdaki
        // 'role bazlı hassas alan filtreleme' describe bloğu).
        const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${cashierToken}`);
        expect(res.status).toBe(200);
        expect(res.body.bestSellingCombos).toEqual([{ ComboName: 'Kahve+Simit', QuantitySold: 12 }]);
        expect(res.body.loyaltyCustomerCount).toBe(5);
        expect(res.body.loyaltyRedeem).toEqual({ freeProductCount: 3, totalPointsSpent: 150 });
        expect(res.body.feedback).toEqual({ avgTaste: 2.5, avgService: 3, avgCleanliness: 2, count: 4 });
    });
});

describe('GET /api/dashboard — role bazlı hassas alan filtreleme', () => {
    const sensitiveFields = [
        'todayRevenue',
        'weeklyRevenue',
        'profitRatio',
        'hourlyRevenue',
        'bestSellingCombos',
        'loyaltyRedeem',
        'categoryDistribution',
    ];
    const operationalFields = [
        'occupiedTables',
        'availableTables',
        'lowStockCount',
        'totalProducts',
        'todayOrders',
        'openTables',
        'lowStockProducts',
        'feedback',
    ];

    test('Waiter: hassas/finansal alanlar response\'ta hiç yok', async () => {
        setFullDashboardHandler();

        const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(200);
        sensitiveFields.forEach((field) => {
            expect(res.body).not.toHaveProperty(field);
        });
        operationalFields.forEach((field) => {
            expect(res.body).toHaveProperty(field);
        });
    });

    test('Cashier: hassas/finansal alanların hepsi response\'ta var', async () => {
        setFullDashboardHandler();

        const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${cashierToken}`);
        expect(res.status).toBe(200);
        sensitiveFields.forEach((field) => {
            expect(res.body).toHaveProperty(field);
        });
    });

    test('Admin: hassas/finansal alanların hepsi response\'ta var', async () => {
        setFullDashboardHandler();

        const res = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        sensitiveFields.forEach((field) => {
            expect(res.body).toHaveProperty(field);
        });
    });
});
