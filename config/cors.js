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

// ============================================================
// AYNI ORIGIN'DEN GELEN İSTEKLER HER ZAMAN SERBEST.
//
// NEDEN GEREKLİ: Müşteri QR menüsü artık backend'in KENDİSİ tarafından
// servis ediliyor (bkz. server.js) — yani menü ile API aynı origin'de.
// Tarayıcı aynı-origin GET'lerde Origin başlığı GÖNDERMEZ ama POST'larda
// (ör. müşterinin sipariş vermesi) GÖNDERİR. Menü telefondan yerel IP ile
// açıldığı için o origin 'http://192.168.1.50:4091' gibi DHCP'ye bağlı,
// önceden bilinemeyen bir adrestir; CORS_ORIGIN listesine yazılamaz.
// Bu yüzden Origin'in host'u isteğin kendi Host başlığıyla aynıysa istek
// aynı-origin sayılır ve whitelist'e bakılmaz.
//
// GÜVENLİK: Bu bir gevşetme DEĞİL — tarayıcı zaten aynı-origin istekleri
// CORS'a hiç tabi tutmaz; burada yaptığımız, o isteklerin sunucu tarafında
// yanlışlıkla reddedilmesini önlemek. Farklı origin'ler için whitelist
// davranışı aynen korunur.
//
// Express'in cors() paketi (req, callback) imzalı bir "options delegate"
// kabul ettiği için Host başlığına erişebiliyoruz; Socket.IO'nun cors
// seçeneği bunu desteklemez ama gerek de yok (müşteri menüsü socket.io
// kullanmıyor, panel ise Tauri origin'leriyle zaten listede).
// ============================================================
function corsOptionsDelegate(req, callback) {
    const origin = req.headers.origin;

    if (origin) {
        try {
            if (new URL(origin).host === req.headers.host) {
                return callback(null, { origin: true });
            }
        } catch {
            // Ayrıştırılamayan Origin (ör. 'null') normal yoldan değerlendirilir.
        }
    }

    return callback(null, { origin: corsOrigin });
}

module.exports = { getAllowedOrigins, corsOrigin, corsOptionsDelegate };
