import axios from 'axios';

// Backend adresi. VARSAYILAN GÖRELİDİR ('/api'): menü, API'yi kendi adresi
// üzerinden çağırır. Menüyü servis eden zaten BACKEND'İN KENDİSİDİR
// (bkz. server.js — musteri-menu/dist statik olarak :4091'den sunulur),
// yani göreli adres her zaman doğru sunucuya gider; araya proxy girmez.
//
// Neden göreli: menünün hangi adresten açıldığı önceden BİLİNEMEZ — yerel
// IP (http://192.168.1.50:4091) ya da bir tünel alan adı
// (https://menu.restoranim.com) olabilir. Adres build anında gömülseydi
// her restoran için menünün yeniden derlenmesi gerekirdi; offline/USB
// kurulumda derleme çıktısı hazır geldiği için bu imkansızdı. Göreli adres
// ayrıca tek origin sağladığı için CORS de hiç devreye girmez.
//
// TARİHÇE: Docker kurulumunda menüyü ayrı bir nginx konteyneri (:8081)
// servis edip '/api'yi backend'e proxy'liyordu. O katman kaldırıldı; göreli
// adres mantığı aynen korundu, çünkü aynı gerekçeyle hâlâ doğru.
//
// VITE_API_URL ile mutlak bir adrese zorlanabilir (nadiren gerekir).
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const API_ORIGIN = BASE_URL.replace(/\/api$/, '');
export const imageUrl = (path) => (path ? `${API_ORIGIN}${path}` : null);

// KİMLİK DOĞRULAMASI YOK — bu istemci tamamen anonim (müşteri) uçlarını
// (/public/menu/:qrToken/...) çağırır. JWT gerektiren personel uçlarına
// hiç erişmez, o yüzden restoran-panel'deki client.js'in aksine token
// interceptor'ı yoktur.
const client = axios.create({
  baseURL: BASE_URL,
});

export default client;
