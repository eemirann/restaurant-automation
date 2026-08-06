process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
// utils/backupScheduler.js yedek dosya adını DB_DATABASE'den türetir (bkz.
// backup-now testi). Bu değeri burada SABİTLEMEZSEK, server.js'in yaptığı
// dotenv.config() çağrısı geliştiricinin gerçek .env'indeki DB_DATABASE'i
// (ör. 'Kafe') sızdırır ve test o değere göre değişir — dotenv zaten SET
// olan bir değişkeni ezmediği için burada erken atama JWT_SECRET ile aynı
// desenle testi ortamdan bağımsız kılar.
process.env.DB_DATABASE = process.env.DB_DATABASE || 'RestoranDB';

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

describe('PUT /api/settings — OpeningTime/ClosingTime doğrulaması', () => {
    test('geçersiz biçim (HH:MM değil) 400 döner', async () => {
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713', OpeningTime: '9:00', ClosingTime: '23:00' });
        expect(res.status).toBe(400);
    });

    test('yalnızca biri girilirse (ikisi de dolu/boş olmalı) 400 döner', async () => {
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713', OpeningTime: '09:00', ClosingTime: null });
        expect(res.status).toBe(400);
    });

    test('ikisi de geçerli HH:MM ise kaydedilir', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT AppSettingsId')) return { recordset: [] };
            if (queryText.includes('INSERT INTO AppSettings')) {
                return {
                    recordset: [{
                        RestaurantName: 'Kafe', ThemeColor: '#FF4713',
                        EArsivVatRate: 10, PrinterPaperWidth: 80, LoyaltyPointsRate: 10, AutoBackupRetentionDays: 7,
                        ProductOptionsPopupEnabled: 1, StockChartEnabled: 1, KitchenAutoPrintEnabled: 1, AutoBackupEnabled: 1,
                        OpeningTime: inputs.OpeningTime, ClosingTime: inputs.ClosingTime, LogoUrl: null,
                    }],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713', OpeningTime: '09:00', ClosingTime: '23:00' });

        expect(res.status).toBe(200);
        expect(res.body.OpeningTime).toBe('09:00');
        expect(res.body.ClosingTime).toBe('23:00');
    });

    test('ikisi de null ise kısıt kaldırılır', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT AppSettingsId')) {
                return { recordset: [{ AppSettingsId: 1, OpeningTime: '09:00', ClosingTime: '23:00' }] };
            }
            if (queryText.includes('UPDATE AppSettings')) {
                return {
                    recordset: [{
                        RestaurantName: 'Kafe', ThemeColor: '#FF4713',
                        EArsivVatRate: 10, PrinterPaperWidth: 80, LoyaltyPointsRate: 10, AutoBackupRetentionDays: 7,
                        ProductOptionsPopupEnabled: 1, StockChartEnabled: 1, KitchenAutoPrintEnabled: 1, AutoBackupEnabled: 1,
                        OpeningTime: inputs.OpeningTime, ClosingTime: inputs.ClosingTime, LogoUrl: null,
                    }],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713', OpeningTime: null, ClosingTime: null });

        expect(res.status).toBe(200);
        expect(res.body.OpeningTime).toBeNull();
        expect(res.body.ClosingTime).toBeNull();
    });
});

describe('PUT /api/settings — LogoUrl bu uçtan YAZILAMAZ ama yanıttan KAYBOLMAZ', () => {
    test('mevcut LogoUrl, PUT yanıtında (değişmeden) döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT AppSettingsId')) {
                return { recordset: [{ AppSettingsId: 1, LogoUrl: '/uploads/logo/logo-123.png' }] };
            }
            if (queryText.includes('UPDATE AppSettings')) {
                // Gerçek DB'de OUTPUT INSERTED.LogoUrl, SET edilmemiş olsa bile
                // satırın GÜNCEL değerini döner — burada da öyle taklit edilir.
                return {
                    recordset: [{
                        RestaurantName: 'Kafe', ThemeColor: '#FF4713',
                        EArsivVatRate: 10, PrinterPaperWidth: 80, LoyaltyPointsRate: 10, AutoBackupRetentionDays: 7,
                        ProductOptionsPopupEnabled: 1, StockChartEnabled: 1, KitchenAutoPrintEnabled: 1, AutoBackupEnabled: 1,
                        OpeningTime: null, ClosingTime: null, LogoUrl: '/uploads/logo/logo-123.png',
                    }],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ RestaurantName: 'Kafe', ThemeColor: '#FF4713', LogoUrl: '/bunu-yazmaya-calis.png' });

        expect(res.status).toBe(200);
        // Body'deki LogoUrl YOK SAYILIR — bu uçtan yazılamaz (bkz. POST/DELETE
        // /api/settings/logo), ama mevcut değer yanıtta KAYBOLMAMALI.
        expect(res.body.LogoUrl).toBe('/uploads/logo/logo-123.png');
    });
});

describe('POST /api/settings/logo', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).post('/api/settings/logo');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).post('/api/settings/logo').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('dosya gönderilmezse 400 döner', async () => {
        const res = await request(app).post('/api/settings/logo').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
    });
});

describe('DELETE /api/settings/logo', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).delete('/api/settings/logo');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).delete('/api/settings/logo').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Admin kaldırabilir, LogoUrl null döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT AppSettingsId, LogoUrl FROM AppSettings')) {
                return { recordset: [{ AppSettingsId: 1, LogoUrl: '/uploads/logo/logo-123.png' }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).delete('/api/settings/logo').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.LogoUrl).toBeNull();
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
