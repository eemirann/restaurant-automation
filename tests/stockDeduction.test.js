process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('../config/db', () => require('./helpers/fakeDb'));
const fakeDb = require('../config/db');
const { deductStockForItem, restoreStockForItem } = require('../utils/stockDeduction');

describe('stockDeduction - reçetesiz ürün (BOM yok)', () => {
    afterEach(() => fakeDb.__reset());

    test('deductStockForItem ürünün kendi stoğunu adet kadar düşer', async () => {
        const calls = [];
        fakeDb.__setHandler(async (queryText, inputs) => {
            calls.push({ queryText, inputs });
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [] }; // reçete yok
            }
            if (queryText.includes('UPDATE Stock')) {
                return { recordset: [{ Quantity: 1, MinStockLevel: 2 }] };
            }
            return { recordset: [] };
        });

        const warnings = await deductStockForItem({}, 42, 3);

        const stockUpdateCall = calls.find((c) => c.queryText.includes('UPDATE Stock'));
        expect(stockUpdateCall.inputs.ProductId).toBe(42);
        expect(stockUpdateCall.inputs.Amount).toBe(3);
        expect(warnings).toEqual([{ ProductId: 42, RemainingStock: 1, IsNegative: false }]);
    });

    test('kalan stok minimum seviyenin üstündeyse uyarı üretilmez', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Recipes')) return { recordset: [] };
            if (queryText.includes('UPDATE Stock')) {
                return { recordset: [{ Quantity: 50, MinStockLevel: 2 }] };
            }
            return { recordset: [] };
        });

        const warnings = await deductStockForItem({}, 42, 1);
        expect(warnings).toEqual([]);
    });

    test('stok negatife düşerse IsNegative true döner', async () => {
        fakeDb.__setHandler(async (queryText) => {
            if (queryText.includes('FROM Recipes')) return { recordset: [] };
            if (queryText.includes('UPDATE Stock')) {
                return { recordset: [{ Quantity: -2, MinStockLevel: 0 }] };
            }
            return { recordset: [] };
        });

        const warnings = await deductStockForItem({}, 42, 10);
        expect(warnings).toEqual([{ ProductId: 42, RemainingStock: -2, IsNegative: true }]);
    });
});

describe('stockDeduction - reçeteli ürün (BOM)', () => {
    afterEach(() => fakeDb.__reset());

    test('deductStockForItem her hammadde satırını Quantity(reçete) x adet(satılan) kadar düşer', async () => {
        const stockUpdateCalls = [];
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM Recipes')) {
                return {
                    recordset: [
                        { RawMaterialProductId: 100, Quantity: 0.2 }, // 200g un
                        { RawMaterialProductId: 200, Quantity: 0.05 }, // 50g peynir
                    ],
                };
            }
            if (queryText.includes('UPDATE Stock')) {
                stockUpdateCalls.push(inputs);
                return { recordset: [{ Quantity: 10, MinStockLevel: 1 }] };
            }
            return { recordset: [] };
        });

        // Menü ürünü (ProductId=1, ör. "Pizza") 3 adet satıldı
        await deductStockForItem({}, 1, 3);

        expect(stockUpdateCalls).toHaveLength(2);
        expect(stockUpdateCalls[0].ProductId).toBe(100);
        expect(stockUpdateCalls[0].Amount).toBeCloseTo(0.6, 5);
        expect(stockUpdateCalls[1].ProductId).toBe(200);
        expect(stockUpdateCalls[1].Amount).toBeCloseTo(0.15, 5);
    });

    test('restoreStockForItem reçeteli ürünün hammaddelerini adet farkı kadar geri ekler', async () => {
        const stockUpdateCalls = [];
        fakeDb.__setHandler(async (queryText, inputs) => {
            if (queryText.includes('FROM Recipes')) {
                return { recordset: [{ RawMaterialProductId: 100, Quantity: 0.2 }] };
            }
            if (queryText.includes('UPDATE Stock')) {
                stockUpdateCalls.push(inputs);
                return { recordset: [] };
            }
            return { recordset: [] };
        });

        await restoreStockForItem({}, 1, 2);

        expect(stockUpdateCalls[0].ProductId).toBe(100);
        expect(stockUpdateCalls[0].Amount).toBeCloseTo(0.4, 5);
    });
});
