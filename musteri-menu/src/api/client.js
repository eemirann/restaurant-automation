import axios from 'axios';

// Backend adresi. VARSAYILAN GÖRELİDİR ('/api'): menü, API'yi kendi
// adresi üzerinden çağırır ve istek nginx tarafından backend'e proxy'lenir
// (bkz. musteri-menu/nginx.conf). Bunun nedeni, menünün hangi adresten
// açıldığının önceden BİLİNEMEMESİ — yerel IP (http://192.168.1.50:8081)
// ya da Cloudflare Tunnel alan adı (https://menu.restoranim.com) olabilir.
// Adres build anında gömülseydi her restoran için imajın yeniden
// derlenmesi gerekirdi; offline/USB kurulumda imajlar hazır geldiği için
// bu imkansızdı. Göreli adres ayrıca tek origin sağladığı için CORS de
// hiç devreye girmez.
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
