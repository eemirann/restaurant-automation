const jwt = require('jsonwebtoken');

let ioInstance = null;

// ============================================================
// Socket.IO'yu başlatır ve JWT ile kimlik doğrulaması yapar
// (REST API'deki authMiddleware.verifyToken ile aynı token'ı kullanır).
// ============================================================
function initSocket(httpServer) {
    const { Server } = require('socket.io');

    ioInstance = new Server(httpServer, {
        cors: { origin: '*' },
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

module.exports = { initSocket, emitTablesChanged };
