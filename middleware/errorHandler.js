const logger = require('../utils/logger');

// ============================================================
// Merkezi hata yönetimi.
// Tüm route'ların EN SONUNA eklenir. Controller'lar kendi
// try/catch'lerini korur; buraya sadece yakalanmayan hatalar
// (ör. JSON parse hatası, beklenmeyen exception) düşer.
// Üretimde stack trace / hata detayı istemciye SIZDIRILMAZ.
// Yakalanan her hata utils/logger.js üzerinden logs/ klasörüne de yazılır
// (bkz. GET /api/logs/recent) — böylece burada biten hatalar en azından
// dosyaya düşer, sessizce kaybolmaz.
// ============================================================

// Tanımlı olmayan route'lar için 404 üretir.
function notFoundHandler(req, res, next) {
    res.status(404).json({ message: 'İstenen kaynak bulunamadı.' });
}

// Express hata yakalayıcı (4 parametreli imza zorunlu).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    // CORS reddi
    if (err && err.message && err.message.startsWith('CORS:')) {
        return res.status(403).json({ message: err.message });
    }

    // Hatalı JSON gövdesi (express.json parse hatası)
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Geçersiz JSON gövdesi.' });
    }

    // multer / dosya yükleme boyutu vb.
    if (err && err.name === 'MulterError') {
        return res.status(400).json({ message: `Dosya yükleme hatası: ${err.message}` });
    }

    logger.error('Yakalanmayan hata', { message: err?.message, stack: err?.stack, path: req.originalUrl, method: req.method });

    const status = err.status || err.statusCode || 500;
    res.status(status).json({ message: 'Sunucuda beklenmeyen bir hata oluştu.' });
}

module.exports = { notFoundHandler, errorHandler };
