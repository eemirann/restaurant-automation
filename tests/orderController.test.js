process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('../config/db');

jest.mock('../config/socket', () => ({
    initSocket: jest.fn(),
    emitTablesChanged: jest.fn(),
    emitKitchen: jest.fn(),
    emitCustomerRequests: jest.fn(),
    emitStockAlert: jest.fn(),
}));
const socket = require('../config/socket');

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

function tokenFor(role, userId = 1) {
    return jwt.sign({ userId, userName: 'test', role }, process.env.JWT_SECRET);
}

const waiterToken = tokenFor('Waiter');

afterEach(() => {
    fakeDb.__reset();
    socket.emitStockAlert.mockClear();
});

describe('POST /api/orders - doğrulama', () => {
    test('TableId/UserId/Items eksikse 400 döner', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [] });
        expect(res.status).toBe(400);
    });

    test('geçersiz Quantity (0 veya negatif) 400 döner', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 0 }] });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/orders - fiyat sunucuda hesaplanır', () => {
    test('client UnitPrice gönderse bile yok sayılır, TotalAmount DB deki Price*Quantity ile hesaplanır', async () => {
        let insertedTotal = null;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedTotal = inputs.TotalAmount;
                return { recordset: [{ OrderId: 1, TableId: 1, UserId: 1, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 4, UnitPrice: 999999 }] });

        expect(res.status).toBe(201);
        // 4 adet x gerçek DB fiyatı (25) = 100, client'ın gönderdiği sahte UnitPrice yok sayıldı
        expect(insertedTotal).toBe(100);
        expect(res.body.totalAmount).toBe(100);
    });

    test('ürün pasifse (IsActive=false) 400 ile reddedilir', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: false, IsAvailable: true }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 1 }] });

        expect(res.status).toBe(400);
    });

    test('ürün bulunamazsa 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 999, Quantity: 1 }] });

        expect(res.status).toBe(404);
    });

    test('varyant fiyatı ana ürün fiyatına eklenir', async () => {
        let insertedTotal = null;

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('FROM ProductVariants')) {
                return { recordset: [{ ProductVariantsId: 5, Price: 10 }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedTotal = inputs.TotalAmount;
                return { recordset: [{ OrderId: 1, TableId: 1, UserId: 1, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, VariantId: 5, Quantity: 2 }] });

        expect(res.status).toBe(201);
        // (25 taban + 10 varyant) x 2 adet = 70
        expect(insertedTotal).toBe(70);
    });
});

describe('POST /api/orders - ekstralar (ekstra shot, şurup vb.)', () => {
    test('ekstra fiyatı adet başına ana ürün fiyatına eklenir ve stoktan düşülür', async () => {
        let insertedTotal = null;
        const stockDeductions = [];

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('JOIN ProductExtras')) {
                return { recordset: [{ ProductId: 50, Price: 5, IsActive: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedTotal = inputs.TotalAmount;
                return { recordset: [{ OrderId: 1, TableId: 1, UserId: 1, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] };
            }
            if (queryText.includes('UPDATE Stock')) {
                stockDeductions.push(inputs);
                return { recordset: [{ Quantity: 100, MinStockLevel: 5 }] };
            }
            return { recordset: [] };
        });

        // 1 kalem: 3 adet kahve, her birine 2 adet "ekstra shot" (+5 birim fiyat)
        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 3, Extras: [{ ExtraProductId: 50, Quantity: 2 }] }] });

        expect(res.status).toBe(201);
        // (25 taban + 2x5 ekstra) x 3 adet = 105
        expect(insertedTotal).toBe(105);

        const extraStockDeduction = stockDeductions.find((d) => d.ProductId === 50);
        expect(extraStockDeduction).toBeDefined();
        // 2 (ekstra adedi) x 3 (ürün adedi) = 6 adet stoktan düşer
        expect(extraStockDeduction.Amount).toBe(6);
    });

    test('IsExtra=1 olmayan veya bu ürüne bağlı olmayan bir ProductId ekstra olarak gönderilirse 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('JOIN ProductExtras')) {
                return { recordset: [] }; // ürüne bağlı+etkin bir ProductExtras satırı yok
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 1, Extras: [{ ExtraProductId: 999, Quantity: 1 }] }] });

        expect(res.status).toBe(404);
    });

    test('geçersiz Extras (negatif Quantity) 400 döner', async () => {
        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 1, Extras: [{ ExtraProductId: 50, Quantity: -1 }] }] });

        expect(res.status).toBe(400);
    });

    test('şurup fiyatı adet başına ana ürün fiyatına eklenir ve stoktan düşülür', async () => {
        let insertedTotal = null;
        const stockDeductions = [];

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('JOIN ProductSyrups')) {
                return { recordset: [{ ProductId: 60, Price: 3, IsActive: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                insertedTotal = inputs.TotalAmount;
                return { recordset: [{ OrderId: 1, TableId: 1, UserId: 1, TotalAmount: inputs.TotalAmount, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] };
            }
            if (queryText.includes('UPDATE Stock')) {
                stockDeductions.push(inputs);
                return { recordset: [{ Quantity: 100, MinStockLevel: 5 }] };
            }
            return { recordset: [] };
        });

        // 1 kalem: 2 adet ice latte, her birine 1 adet "vanilya şurubu" (+3 birim fiyat)
        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 2, Syrups: [{ SyrupProductId: 60, Quantity: 1 }] }] });

        expect(res.status).toBe(201);
        // (25 taban + 1x3 şurup) x 2 adet = 56
        expect(insertedTotal).toBe(56);

        const syrupStockDeduction = stockDeductions.find((d) => d.ProductId === 60);
        expect(syrupStockDeduction).toBeDefined();
        expect(syrupStockDeduction.Amount).toBe(2);
    });

    test('bu ürüne bağlı olmayan bir şurup gönderilirse 404 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('JOIN ProductSyrups')) {
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 1, Syrups: [{ SyrupProductId: 999, Quantity: 1 }] }] });

        expect(res.status).toBe(404);
    });
});

describe('PATCH /api/orders/:id/cancel - yetki', () => {
    test('Admin olmayan rol iptal edemez (403)', async () => {
        const res = await request(app)
            .patch('/api/orders/1/cancel')
            .set('Authorization', `Bearer ${waiterToken}`);
        expect(res.status).toBe(403);
    });
});

describe('PATCH /api/orders/:id/cancel - sebep (Reason) audit\'e yazılır', () => {
    test('Reason gönderilirse AuditLog.Details içine yazılır', async () => {
        const adminToken = tokenFor('Admin');
        const auditInserts = [];

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT TableId, Status FROM Orders')) {
                return { recordset: [{ TableId: 1, Status: 'Pending' }] };
            }
            if (queryText.includes('SELECT OrderDetailsId, ProductId, Quantity FROM OrderDetails')) {
                return { recordset: [] };
            }
            if (queryText.includes("SELECT OrderId FROM Orders WHERE TableId")) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO AuditLog')) {
                auditInserts.push(inputs);
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .patch('/api/orders/1/cancel')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ Reason: 'Müşteri vazgeçti' });

        expect(res.status).toBe(200);

        // logAudit fire-and-forget çalışır (bkz. utils/audit.js) — event loop'un bir turunu bekle.
        await new Promise((r) => setImmediate(r));
        expect(auditInserts).toHaveLength(1);
        expect(auditInserts[0].Action).toBe('ORDER_CANCEL');
        expect(JSON.parse(auditInserts[0].Details)).toEqual({ TableId: 1, Reason: 'Müşteri vazgeçti' });
    });

    test('Reason gönderilmezse Details.Reason null olur', async () => {
        const adminToken = tokenFor('Admin');
        const auditInserts = [];

        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('SELECT TableId, Status FROM Orders')) {
                return { recordset: [{ TableId: 1, Status: 'Pending' }] };
            }
            if (queryText.includes('SELECT OrderDetailsId, ProductId, Quantity FROM OrderDetails')) {
                return { recordset: [] };
            }
            if (queryText.includes('SELECT OrderId FROM Orders WHERE TableId')) {
                return { recordset: [] };
            }
            if (queryText.includes('INSERT INTO AuditLog')) {
                auditInserts.push(inputs);
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .patch('/api/orders/1/cancel')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        expect(res.status).toBe(200);
        await new Promise((r) => setImmediate(r));
        expect(JSON.parse(auditInserts[0].Details)).toEqual({ TableId: 1, Reason: null });
    });
});

describe('GET /api/orders/:id/history', () => {
    test('AuditLog\'dan bu siparişe ait kayıtları kronolojik döner', async () => {
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM AuditLog a')) {
                expect(inputs.OrderId).toBe('1');
                return {
                    recordset: [
                        { AuditLogId: 1, UserId: 5, UserName: 'Ayşe Kasiyer', Action: 'ORDER_ITEM_ADD', Details: '{"items":[{"ProductId":10,"Quantity":1}]}', CreatedAt: new Date() },
                        { AuditLogId: 2, UserId: 5, UserName: 'Ayşe Kasiyer', Action: 'ORDER_CANCEL', Details: '{"TableId":1,"Reason":null}', CreatedAt: new Date() },
                    ],
                };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .get('/api/orders/1/history')
            .set('Authorization', `Bearer ${waiterToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].Action).toBe('ORDER_ITEM_ADD');
        expect(res.body[1].Action).toBe('ORDER_CANCEL');
    });

    test('DB hatasında 500 döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM AuditLog a')) {
                throw new Error('DB patladı');
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .get('/api/orders/1/history')
            .set('Authorization', `Bearer ${waiterToken}`);

        expect(res.status).toBe(500);
    });
});

describe('POST /api/orders - düşük stok bildirimi (emitStockAlert)', () => {
    test('stok minimum seviyenin altına düşerse commit sonrası emitStockAlert ürün adıyla çağrılır', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                return { recordset: [{ OrderId: 1, TableId: 1, UserId: 1, TotalAmount: 25, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] };
            }
            if (queryText.includes('UPDATE Stock')) {
                // Kalan (1) minimum seviyenin (5) altında -> deductStockForItem uyarı üretir
                return { recordset: [{ Quantity: 1, MinStockLevel: 5 }] };
            }
            if (queryText.includes('SELECT ProductId, Name FROM Products WHERE ProductId IN')) {
                return { recordset: [{ ProductId: 10, Name: 'Filtre Kahve' }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 1 }] });

        expect(res.status).toBe(201);
        expect(res.body.lowStockWarnings).toEqual([{ ProductId: 10, RemainingStock: 1, IsNegative: false }]);

        // notifyLowStock best-effort/fire-and-forget çalışır — event loop'un bir turunu bekle.
        await new Promise((r) => setImmediate(r));
        expect(socket.emitStockAlert).toHaveBeenCalledTimes(1);
        expect(socket.emitStockAlert).toHaveBeenCalledWith({
            warnings: [{ ProductId: 10, Name: 'Filtre Kahve', RemainingStock: 1, IsNegative: false }],
        });
    });

    test('stok yeterliyse (uyarı yok) emitStockAlert ÇAĞRILMAZ', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('SELECT ProductId, Price, IsActive, IsAvailable FROM Products')) {
                return { recordset: [{ ProductId: 10, Price: 25, IsActive: true, IsAvailable: true }] };
            }
            if (queryText.includes('INSERT INTO Orders')) {
                return { recordset: [{ OrderId: 1, TableId: 1, UserId: 1, TotalAmount: 25, Status: 'Pending', Note: null, CreatedAt: new Date() }] };
            }
            if (queryText.includes('INSERT INTO OrderDetails')) {
                return { recordset: [{ OrderDetailsId: 1 }] };
            }
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] };
            }
            if (queryText.includes('UPDATE Stock')) {
                return { recordset: [{ Quantity: 100, MinStockLevel: 5 }] };
            }
            return { recordset: [] };
        });

        const res = await request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${waiterToken}`)
            .send({ TableId: 1, UserId: 1, Items: [{ ProductId: 10, Quantity: 1 }] });

        expect(res.status).toBe(201);
        expect(res.body.lowStockWarnings).toEqual([]);

        await new Promise((r) => setImmediate(r));
        expect(socket.emitStockAlert).not.toHaveBeenCalled();
    });
});
