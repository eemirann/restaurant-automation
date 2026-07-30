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

describe('GET /api/settings — otomatik yedekleme alanları', () => {
    test('kayıt yoksa varsayılan AutoBackupEnabled/AutoBackupRetentionDays döner', async () => {
        const res = await request(app).get('/api/settings');
        expect(res.status).toBe(200);
        expect(res.body.AutoBackupEnabled).toBe(false);
        expect(res.body.AutoBackupRetentionDays).toBe(7);
    });

    test('kayıt varsa AutoBackupEnabled/AutoBackupRetentionDays doğru tipte döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM AppSettings')) {
                return {
                    recordset: [{
                        RestaurantName: 'Kafe', ThemeColor: '#FF4713',
                        ProductOptionsPopupEnabled: 1, StockChartEnabled: 1, KitchenAutoPrintEnabled: 1, AutoBackupEnabled: 1,
                        EArsivVatRate: 10, PrinterPaperWidth: 80, LoyaltyPointsRate: 10, AutoBackupRetentionDays: 14,
                    }],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/settings');
        expect(res.status).toBe(200);
        expect(res.body.AutoBackupEnabled).toBe(true);
        expect(res.body.AutoBackupRetentionDays).toBe(14);
    });
});

describe('PUT /api/settings — AutoBackupRetentionDays doğrulaması', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).put('/api/settings').send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713' });
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713' });
        expect(res.status).toBe(403);
    });

    test('AutoBackupRetentionDays 0 ise 400 döner', async () => {
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713', AutoBackupRetentionDays: 0 });
        expect(res.status).toBe(400);
    });

    test('AutoBackupRetentionDays 366 ise 400 döner', async () => {
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713', AutoBackupRetentionDays: 366 });
        expect(res.status).toBe(400);
    });

    test('geçerli AutoBackupEnabled/AutoBackupRetentionDays kaydedilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT AppSettingsId')) {
                return { recordset: [] }; // henüz kayıt yok -> INSERT yolu
            }
            if (queryText.includes('INSERT INTO AppSettings')) {
                return {
                    recordset: [{
                        RestaurantName: 'Kafe', ThemeColor: '#FF4713',
                        EArsivVatRate: 10, PrinterPaperWidth: 80, LoyaltyPointsRate: 10, AutoBackupRetentionDays: 30,
                        ProductOptionsPopupEnabled: 1, StockChartEnabled: 1, KitchenAutoPrintEnabled: 1, AutoBackupEnabled: 1,
                    }],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713', AutoBackupEnabled: true, AutoBackupRetentionDays: 30 });

        expect(res.status).toBe(200);
        expect(res.body.AutoBackupEnabled).toBe(true);
        expect(res.body.AutoBackupRetentionDays).toBe(30);
    });
});

describe('POST /api/settings/backup-now', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).post('/api/settings/backup-now');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).post('/api/settings/backup-now').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Admin anlık yedek tetikleyebilir (200, BackupHistory kaydı döner)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('BACKUP DATABASE')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO BackupHistory')) {
                return { recordset: [{ Id: 1, FileName: 'RestoranDB_2026-08-05.bak', SizeBytes: null }] };
            }
            if (queryText.includes('AutoBackupRetentionDays FROM AppSettings')) {
                return { recordset: [{ AutoBackupRetentionDays: 7 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/settings/backup-now').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.fileName).toMatch(/^RestoranDB_\d{4}-\d{2}-\d{2}\.bak$/);
    });
});

describe('GET /api/settings/backups', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/settings/backups');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).get('/api/settings/backups').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Admin son yedekleri listeleyebilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM BackupHistory')) {
                return { recordset: [{ Id: 2, FileName: 'RestoranDB_2026-08-05.bak', CreatedAt: '2026-08-05T03:00:00.000Z', SizeBytes: 1048576 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/settings/backups').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].FileName).toBe('RestoranDB_2026-08-05.bak');
    });
});
