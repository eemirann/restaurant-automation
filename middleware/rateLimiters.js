const rateLimit = require('express-rate-limit');

// ============================================================
// Giriş (login) brute-force koruması.
// PIN sadece 4 hane olduğu için özellikle /login-pin uçları
// deneme sınırına ihtiyaç duyar.
// ============================================================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: 10,                  // IP başına 15 dakikada en fazla 10 başarısız/başarılı deneme
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Çok fazla giriş denemesi yaptınız. Lütfen bir süre sonra tekrar deneyin.' },
});

// ============================================================
// Genel API sınırlayıcı - tüm /api trafiğine geniş bir tavan.
// Normal kullanımda asla tetiklenmez; kötüye kullanımı engeller.
// ============================================================
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.' },
});

// ============================================================
// Müşteri QR menüsü - KİMLİK DOĞRULAMASIZ, halka açık uçlar.
// Menü görüntüleme (GET) daha rahat; sipariş/hizmet isteği gönderme
// (POST) spam'i (ör. "garson çağır"a defalarca basmak) önlemek için
// daha sıkı. İkisi de tek bir masanın (QrToken ile) trafiğini değil,
// IP başına genel bir tavanı sınırlar.
// ============================================================
const publicMenuViewLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.' },
});

const publicMenuActionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla istek gönderildi. Lütfen biraz bekleyin.' },
});

module.exports = { loginLimiter, apiLimiter, publicMenuViewLimiter, publicMenuActionLimiter };
