import axios from 'axios';

// Backend'in çalıştığı adres. VITE_API_URL ile geçersiz kılınabilir
// (bkz. .env.example) — restoran-panel'deki client.js ile aynı desen.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4091/api';

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
