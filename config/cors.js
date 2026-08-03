// ============================================================
// CORS origin yapılandırması - hem REST (server.js) hem
// Socket.IO (config/socket.js) aynı whitelist'i kullanır.
//
// CORS_ORIGIN env değişkeni virgülle ayrılmış origin listesi alır:
//   CORS_ORIGIN=http://localhost:5173,https://panel.restoranim.com
// Boş bırakılırsa geliştirme kolaylığı için tüm origin'lere izin verilir
// (üretimde MUTLAKA set edilmeli).
// ============================================================

// Masaüstü (Tauri) kabuğunun WebView origin'leri. Panel uygulama içinde bu
// origin'den servis edilip backend'e http://localhost:4091 üzerinden gider —
// yani teknik olarak CROSS-ORIGIN'dir. Bunlar birinci-parti istemci olduğu
// için CORS_ORIGIN listesine her zaman EKLENİR; aksi halde CORS_ORIGIN set
// edilmiş bir kurulumda (ör. docker-compose) masaüstü uygulaması engellenir.
const TAURI_ORIGINS = ['http://tauri.localhost', 'tauri://localhost'];

function getAllowedOrigins() {
    const raw = process.env.CORS_ORIGIN;
    if (!raw || raw.trim() === '') return null; // null => hepsine izin ver
    const listed = raw.split(',').map((o) => o.trim()).filter(Boolean);
    return [...new Set([...listed, ...TAURI_ORIGINS])];
}

// Express cors() ve Socket.IO cors için ortak origin doğrulama fonksiyonu.
function corsOrigin(origin, callback) {
    const allowed = getAllowedOrigins();

    // Whitelist yoksa (geliştirme) her origin'e izin ver.
    if (allowed === null) return callback(null, true);

    // Origin yoksa (ör. curl, mobil uygulama, aynı origin) izin ver.
    if (!origin) return callback(null, true);

    if (allowed.includes(origin)) return callback(null, true);

    return callback(new Error('CORS: Bu origin\'e izin verilmiyor'));
}

module.exports = { getAllowedOrigins, corsOrigin };
