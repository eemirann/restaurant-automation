const jwt = require('jsonwebtoken');
const { corsOrigin } = require('./cors');

let ioInstance = null;

// ============================================================
// Socket.IO'yu başlatır ve JWT ile kimlik doğrulaması yapar
// (REST API'deki authMiddleware.verifyToken ile aynı token'ı kullanır).
// ============================================================
function initSocket(httpServer) {
    const { Server } = require('socket.io');

    ioInstance = new Server(httpServer, {
        cors: { origin: corsOrigin },
    });

    ioInstance.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Token bulunamadı'));

        try {
            socket.user = jwt.verify(token, process.env.JWT_SECRET);
            next();
        } catch {
            next(new Error('Geçersiz token'));
        }
    });

    ioInstance.on('connection', () => {});

    return ioInstance;
}

// Masa/sipariş/ödeme durumunu etkileyebilecek her mutasyondan sonra çağrılır.
// Payload taşımaz; istemciler event'i alınca kendi GET /tables çağrısıyla tazelenir
// (tek doğruluk kaynağı hep aynı REST sorgusu kalır, event sadece "şimdi tazelen" sinyalidir).
function emitTablesChanged() {
    ioInstance?.emit('tables:changed');
}

// ============================================================
// Mutfak Ekranı (KDS) bildirimleri.
// Rol modelinde ayrı bir "Kitchen" rolü olmadığı için event'ler tüm
// kimlik-doğrulanmış istemcilere yayınlanır; KDS ekranı ilgili event'i
// dinleyip GET /api/kds/queue ile tazelenir. Payload sadece "hangi
// sipariş/kalem" ipucu taşır, tek doğruluk kaynağı yine REST sorgusudur.
//   event: 'kds:new'      -> mutfağa yeni kalem(ler) düştü
//   event: 'kds:updated'  -> bir kalemin hazırlanma durumu değişti
// ============================================================
function emitKitchen(event, payload) {
    ioInstance?.emit(event, payload || {});
}

module.exports = { initSocket, emitTablesChanged, emitKitchen };
