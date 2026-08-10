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

afterEach(() => fakeDb.__reset());

describe('GET /api/customer-orders', () => {
    test('token yoksa 401 döner', async () => {
        const res = await request(app).get('/api/customer-orders');
        expect(res.status).toBe(401);
    });

    test('bekleyen istekleri kalemleriyle birlikte döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests r')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, TableNumber: 4, Note: null, Status: 'Pending', CreatedAt: new Date().toISOString() }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems i')) {
                return { recordset: [{ CustomerOrderRequestId: 1, ProductId: 5, ProductName: 'Latte', Quantity: 2, ExtrasJson: JSON.stringify([{ ExtraProductId: 9, Quantity: 1 }]), SyrupsJson: null }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).get('/api/customer-orders?status=Pending').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].items).toHaveLength(1);
        expect(res.body[0].items[0].Extras).toEqual([{ ExtraProductId: 9, Quantity: 1 }]);
    });
});

describe('POST /api/customer-orders/:id/approve', () => {
    test('istek bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(404);
    });

    test('istek zaten onaylanmış/reddedilmişse 400 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Approved' }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(400);
    });

    test('onaylanınca ürün artık aktif değilse buildOrderInTransaction hatası 400 olarak döner ve istek Pending kalır', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Pending' }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [{ ProductId: 5, Quantity: 2, VariantId: null, Note: null, ExtrasJson: null, SyrupsJson: null }] };
            }
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 5, Price: 85, IsActive: false, IsAvailable: true }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(400);
    });

    test('geçerli istek onaylanınca gerçek sipariş oluşturulur (201) ve istek Approved işaretlenir', async () => {
        let updatedToApproved = false;
        let insertedOrderUserId = null;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM CustomerOrderRequests') && queryText.includes('UPDLOCK')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: 'Az şekerli', Status: 'Pending' }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [{ ProductId: 5, Quantity: 2, VariantId: null, Note: null, ExtrasJson: null, SyrupsJson: null }] };
            }
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 5, Price: 85, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedOrderUserId = inputs.UserId;
                return { recordset: [{ OrderId: 55, TableId: 4, UserId: inputs.UserId, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: inputs.Note, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] };
            }
            if (queryText.includes("UPDATE CustomerOrderRequests")) {
                updatedToApproved = true;
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(201);
        expect(res.body.order.OrderId).toBe(55);
        // Onaylayan personelin UserId'si siparişe atanır (waiterToken userId=7)
        expect(insertedOrderUserId).toBe(7);
        expect(updatedToApproved).toBe(true);
    });

    test('CombosJson dolu bir istek onaylanınca combo bileşenleri gerçek OrderDetails satırlarına açılır', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM CustomerOrderRequests') && queryText.includes('UPDLOCK')) {
                return {
                    recordset: [{
                        CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Pending',
                        Username: null, CombosJson: JSON.stringify([{ ComboOfferId: 9, Quantity: 2 }]),
                    }],
                };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [] };
            }
            if (queryText.includes('FROM ComboOffers WHERE ComboOfferId')) {
                return { recordset: [{ ComboOfferId: 9, Name: 'Kahve+Simit', Price: 60, IsActive: true }] };
            }
            if (queryText.includes('FROM Campaigns')) {
                return { recordset: [{ CampaignId: 3 }] };
            }
            if (queryText.includes('FROM ComboOfferItems ci')) {
                return {
                    recordset: [
                        { ProductId: 5, Quantity: 1, IsActive: true, IsAvailable: true },
                        { ProductId: 8, Quantity: 1, IsActive: true, IsAvailable: true },
                    ],
                };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                return { recordset: [{ OrderId: 60, TableId: 4, UserId: inputs.UserId, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('FROM Recipes')) return { recordset: [] };
            if (queryText.includes('UPDATE CustomerOrderRequests')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(201);
        // 2 combo × 60 TL = 120 TL — fiyat tamamen ComboOffers.Price'tan gelir
        expect(res.body.totalAmount).toBe(120);
    });

    test('Username dolu bir istek onaylanınca sadaklık puanı işlenir (yeni müşteri oluşturulur)', async () => {
        let insertedCustomer = null;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM CustomerOrderRequests') && queryText.includes('UPDLOCK')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Pending', Username: 'ahmet', CombosJson: null }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [{ ProductId: 5, Quantity: 2, VariantId: null, Note: null, ExtrasJson: null, SyrupsJson: null }] };
            }
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 5, Price: 50, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                return { recordset: [{ OrderId: 61, TableId: 4, UserId: inputs.UserId, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) return { recordset: [] };
            if (queryText.includes('UPDATE CustomerOrderRequests')) return { recordset: [] };
            if (queryText.includes('SELECT TOP 1 LoyaltyPointsRate FROM AppSettings')) {
                return { recordset: [{ LoyaltyPointsRate: 10 }] };
            }
            if (queryText.includes('SELECT CustomerId FROM Customers WHERE Username')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO Customers')) {
                insertedCustomer = { username: inputs.Username, points: inputs.Points };
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(201);
        // totalAmount = 50 * 2 = 100 TL; %10 oranla 10 puan
        expect(res.body.loyaltyPointsAwarded).toBe(10);
        expect(insertedCustomer).toEqual({ username: 'ahmet', points: 10 });
    });
});

describe('POST /api/customer-orders/:id/approve — TipAmount', () => {
    test('istekte TipAmount varsa Orders.TipAmount olarak yazılır', async () => {
        let insertedTip = null;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM CustomerOrderRequests') && queryText.includes('UPDLOCK')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Pending', Username: null, CombosJson: null, TipAmount: 12 }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [{ ProductId: 5, Quantity: 2, VariantId: null, Note: null, ExtrasJson: null, SyrupsJson: null }] };
            }
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 5, Price: 50, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedTip = inputs.TipAmount;
                return { recordset: [{ OrderId: 70, TableId: 4, UserId: inputs.UserId, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date(), TipAmount: inputs.TipAmount }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) return { recordset: [{ OrderDetailsId: 1 }] };
            if (queryText.includes('FROM Recipes')) return { recordset: [] };
            if (queryText.includes('UPDATE CustomerOrderRequests')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(201);
        // totalAmount = 50 * 2 = 100; TipAmount=12 < %50 sınırı, kabul edilir
        expect(insertedTip).toBe(12);
    });

    test('TipAmount ara toplamın %50 sınırını aşarsa 400 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM CustomerOrderRequests') && queryText.includes('UPDLOCK')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Pending', Username: null, CombosJson: null, TipAmount: 999 }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [{ ProductId: 5, Quantity: 2, VariantId: null, Note: null, ExtrasJson: null, SyrupsJson: null }] };
            }
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 5, Price: 50, IsActive: true, IsAvailable: true }] };
            }
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(400);
    });
});

describe('POST /api/customer-orders/:id/approve — masada açık sipariş varsa AYNI siparişe eklenir', () => {
    test('masada açık (Pending) sipariş varken onaylanan istek yeni sipariş AÇMAZ, mevcut siparişe eklenir', async () => {
        let insertedNewOrder = false;
        let totalAmountUpdate = null;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM CustomerOrderRequests') && queryText.includes('UPDLOCK')) {
                return { recordset: [{ CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Pending', Username: null, CombosJson: null, TipAmount: null }] };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) {
                return { recordset: [{ ProductId: 5, Quantity: 1, VariantId: null, Note: null, ExtrasJson: null, SyrupsJson: null }] };
            }
            // Masanın açık siparişi var mı kontrolü (yeni eklenen sorgu, bkz. controllers/customerOrderController.js)
            if (queryText.includes('SELECT OrderId, TotalAmount FROM Orders WITH')) {
                return { recordset: [{ OrderId: 99, TotalAmount: 50 }] };
            }
            // addItemsToOrderInTransaction'ın kendi sipariş sorgusu (bkz. utils/orderBuilder.js)
            if (queryText.includes('SELECT OrderId, Status, TotalAmount FROM Orders WHERE OrderId')) {
                return { recordset: [{ OrderId: 99, Status: 'Pending', TotalAmount: 50 }] };
            }
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 5, Price: 30, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('SELECT OrderDetailsId, Quantity FROM OrderDetails')) {
                return { recordset: [] }; // ürün siparişte henüz yok, yeni satır açılacak
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedNewOrder = true;
                return { recordset: [{ OrderId: 1234, TableId: 4, UserId: inputs.UserId, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('UPDATE Orders SET TotalAmount')) {
                totalAmountUpdate = Number(inputs.TotalAmount);
                return { recordset: [] };
            }
            if (queryText.includes('FROM Recipes')) return { recordset: [] };
            if (queryText.includes('SELECT * FROM Orders WHERE OrderId')) {
                return { recordset: [{ OrderId: 99, TableId: 4, TotalAmount: 80, Status: 'Pending', CreatedAt: new Date() }] };
            }
            if (queryText.includes('UPDATE CustomerOrderRequests')) return { recordset: [] };
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);

        expect(res.status).toBe(201);
        expect(insertedNewOrder).toBe(false); // yeni bir Orders satırı AÇILMADI
        expect(res.body.order.OrderId).toBe(99); // masanın zaten açık olan siparişi
        expect(totalAmountUpdate).toBe(80); // 50 (var olan) + 30 (yeni eklenen 1x ürün) — üzerine YAZILMADI, üzerine EKLENDİ
    });

    test('istek Combo içeriyorsa, masada açık sipariş olsa bile YİNE DE yeni sipariş açılır (kapsam dışı)', async () => {
        let insertedNewOrder = false;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM CustomerOrderRequests') && queryText.includes('UPDLOCK')) {
                return {
                    recordset: [{
                        CustomerOrderRequestId: 1, TableId: 4, Note: null, Status: 'Pending',
                        Username: null, CombosJson: JSON.stringify([{ ComboOfferId: 9, Quantity: 1 }]), TipAmount: null,
                    }],
                };
            }
            if (queryText.includes('FROM CustomerOrderRequestItems')) return { recordset: [] };
            if (queryText.includes('FROM ComboOffers WHERE ComboOfferId')) {
                return { recordset: [{ ComboOfferId: 9, Name: 'Kahve+Simit', Price: 60, IsActive: true }] };
            }
            if (queryText.includes('FROM Campaigns')) return { recordset: [{ CampaignId: 3 }] };
            if (queryText.includes('FROM ComboOfferItems ci')) {
                return { recordset: [{ ProductId: 5, Quantity: 1, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedNewOrder = true;
                return { recordset: [{ OrderId: 1234, TableId: 4, UserId: inputs.UserId, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('FROM Recipes')) return { recordset: [] };
            if (queryText.includes('UPDATE CustomerOrderRequests')) return { recordset: [] };
            // NOT: "masada açık sipariş var mı" sorgusuna bilerek dolu bir recordset
            // dönmüyoruz bile — Combo'lu istekte bu sorgu hiç ÇALIŞTIRILMAMALI.
            return { recordset: [] };
        });

        const res = await request(app).post('/api/customer-orders/1/approve').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(201);
        expect(insertedNewOrder).toBe(true);
    });
});

describe('POST /api/customer-orders/:id/reject', () => {
    test('istek bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async () => ({ recordset: [] }));
        const res = await request(app).post('/api/customer-orders/1/reject').set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(404);
    });

    test('geçerli istek reddedilebilir (200), Orders\'a hiç dokunulmaz', async () => {
        let insertedIntoOrders = false;
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT CustomerOrderRequestId, Status FROM CustomerOrderRequests')) {
                return { recordset: [{ CustomerOrderRequestId: 1, Status: 'Pending' }] };
            }
            if (queryText.includes('INSERT INTO Orders')) insertedIntoOrders = true;
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/customer-orders/1/reject')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ Reason: 'Stokta yok' });
        expect(res.status).toBe(200);
        expect(insertedIntoOrders).toBe(false);
    });
});
