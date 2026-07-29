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
const adminToken = tokenFor('Admin', 1);

afterEach(() => fakeDb.__reset());

describe('GET /api/campaigns', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/campaigns');
        expect(res.status).toBe(401);
    });

    test('Admin olmayan rol 403 döner', async () => {
        const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });

    test('Admin kampanya listesini kalemleriyle görebilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Campaigns c')) {
                return { recordset: [{ CampaignId: 1, Title: 'Yaz Combo', IsActive: true, CampaignType: 'Combo', ComboOfferId: 9, ComboName: 'Kahve+Simit', ComboPrice: 60 }] };
            }
            if (queryText.includes('FROM ComboOfferItems ci')) {
                return { recordset: [{ ComboOfferId: 9, ProductId: 5, ProductName: 'Latte', Quantity: 1 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/campaigns').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].ComboItems).toHaveLength(1);
        expect(res.body[0].ComboItems[0].ProductName).toBe('Latte');
    });
});

describe('POST /api/campaigns', () => {
    test('Başlık eksikse 400 döner', async () => {
        const res = await request(app)
            .post('/api/campaigns')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ StartAt: '2026-01-01', EndAt: '2026-01-31', CampaignType: 'Info' });
        expect(res.status).toBe(400);
    });

    test('geçersiz CampaignType 400 döner', async () => {
        const res = await request(app)
            .post('/api/campaigns')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Title: 'Test', StartAt: '2026-01-01', EndAt: '2026-01-31', CampaignType: 'Discount' });
        expect(res.status).toBe(400);
    });

    test('Combo tipi için Combo alanı eksikse 400 döner', async () => {
        const res = await request(app)
            .post('/api/campaigns')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Title: 'Test', StartAt: '2026-01-01', EndAt: '2026-01-31', CampaignType: 'Combo' });
        expect(res.status).toBe(400);
    });

    test('geçerli Info kampanyası oluşturulabilir (201)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('INSERT INTO Campaigns')) {
                return { recordset: [{ CampaignId: 1, Title: 'Kahve Günü', CampaignType: 'Info', IsActive: true }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/campaigns')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Title: 'Kahve Günü', StartAt: '2026-01-01T00:00:00Z', EndAt: '2026-01-31T00:00:00Z', CampaignType: 'Info' });

        expect(res.status).toBe(201);
        expect(res.body.Title).toBe('Kahve Günü');
    });

    test('geçerli Combo kampanyası oluşturulabilir (201), ComboOffers+ComboOfferItems yazılır', async () => {
        let comboOffersInserted = false;
        let comboItemsInsertedCount = 0;

        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('INSERT INTO ComboOffers')) {
                comboOffersInserted = true;
                return { recordset: [{ ComboOfferId: 9 }] };
            }
            if (queryText.includes('INSERT INTO ComboOfferItems')) {
                comboItemsInsertedCount += 1;
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO Campaigns')) {
                return { recordset: [{ CampaignId: 2, Title: 'Kahve+Simit Menü', CampaignType: 'Combo', ComboOfferId: 9, IsActive: true }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/campaigns')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                Title: 'Kahve+Simit Menü',
                StartAt: '2026-01-01T00:00:00Z',
                EndAt: '2026-01-31T00:00:00Z',
                CampaignType: 'Combo',
                Combo: { Name: 'Kahve+Simit', Price: 60, Items: [{ ProductId: 5, Quantity: 1 }, { ProductId: 8, Quantity: 1 }] },
            });

        expect(res.status).toBe(201);
        expect(comboOffersInserted).toBe(true);
        expect(comboItemsInsertedCount).toBe(2);
        expect(res.body.ComboOfferId).toBe(9);
    });
});

describe('DELETE /api/campaigns/:id', () => {
    test('bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).delete('/api/campaigns/1').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });

    test('geçerli kampanya soft-delete edilir (200)', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('UPDATE Campaigns SET IsActive = 0')) {
                return { recordset: [{ CampaignId: 1, IsActive: false }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).delete('/api/campaigns/1').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.IsActive).toBe(false);
    });
});
