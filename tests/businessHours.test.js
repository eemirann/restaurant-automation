// Açılış/kapanış saati hesabı (utils/businessHours.js). Saf fonksiyon —
// DB/HTTP yok, `now` parametresiyle deterministik test edilir.
const { isOpenNow } = require('../utils/businessHours');

const at = (h, m) => new Date(2026, 0, 1, h, m, 0);

describe('isOpenNow', () => {
    test('OpeningTime/ClosingTime ikisi de null -> her zaman açık', () => {
        expect(isOpenNow(null, null, at(3, 0))).toBe(true);
        expect(isOpenNow(null, null, at(23, 59))).toBe(true);
    });

    test('sadece biri null -> kısıt yok sayılır (her zaman açık)', () => {
        expect(isOpenNow('09:00', null, at(3, 0))).toBe(true);
        expect(isOpenNow(null, '23:00', at(3, 0))).toBe(true);
    });

    describe('normal (aynı gün içinde biten) aralık — 09:00-23:00', () => {
        test('açılış anında açık', () => {
            expect(isOpenNow('09:00', '23:00', at(9, 0))).toBe(true);
        });
        test('gün ortasında açık', () => {
            expect(isOpenNow('09:00', '23:00', at(15, 30))).toBe(true);
        });
        test('kapanış anında KAPALI (üst sınır hariç)', () => {
            expect(isOpenNow('09:00', '23:00', at(23, 0))).toBe(false);
        });
        test('kapanıştan bir dakika önce açık', () => {
            expect(isOpenNow('09:00', '23:00', at(22, 59))).toBe(true);
        });
        test('açılıştan önce (sabah erken) kapalı', () => {
            expect(isOpenNow('09:00', '23:00', at(8, 59))).toBe(false);
        });
        test('gece yarısı kapalı', () => {
            expect(isOpenNow('09:00', '23:00', at(0, 0))).toBe(false);
        });
    });

    describe('gece yarısını geçen aralık — 18:00-02:00', () => {
        test('akşam açılıştan hemen sonra açık', () => {
            expect(isOpenNow('18:00', '02:00', at(18, 0))).toBe(true);
        });
        test('gece yarısı açık', () => {
            expect(isOpenNow('18:00', '02:00', at(0, 0))).toBe(true);
        });
        test('kapanıştan bir dakika önce (01:59) açık', () => {
            expect(isOpenNow('18:00', '02:00', at(1, 59))).toBe(true);
        });
        test('kapanış anında (02:00) KAPALI', () => {
            expect(isOpenNow('18:00', '02:00', at(2, 0))).toBe(false);
        });
        test('öğlen (kapalı saatler ortası) kapalı', () => {
            expect(isOpenNow('18:00', '02:00', at(13, 0))).toBe(false);
        });
        test('açılıştan hemen önce (17:59) kapalı', () => {
            expect(isOpenNow('18:00', '02:00', at(17, 59))).toBe(false);
        });
    });

    test('açılış = kapanış -> 24 saat açık kabul edilir', () => {
        expect(isOpenNow('10:00', '10:00', at(3, 0))).toBe(true);
        expect(isOpenNow('10:00', '10:00', at(23, 59))).toBe(true);
    });

    test('bozuk biçim (regex geçmeyen) -> engellemez, açık sayılır', () => {
        expect(isOpenNow('yanlis', '23:00', at(3, 0))).toBe(true);
    });
});
