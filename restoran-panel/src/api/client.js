import axios from 'axios';

// Masaüstü (Tauri) uygulamasında backend HER ZAMAN aynı makinede, uygulamanın
// kendi başlattığı süreçte çalışır. Bu yüzden derleme anında .env'e gömülmüş
// adres (ör. VITE_API_URL=http://10.30.80.139:4091/api gibi bir LAN IP'si)
// KULLANILMAZ — aksi halde paket başka bir makineye kurulduğunda ya da IP
// değiştiğinde uygulama backend'ini bulamaz. Ayrıca CSP'nin yalnızca
// localhost'a izin veren dar haliyle uyumlu kalır.
const TAURI_ORTAMI =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

// Backend adresi. Öncelik: Tauri -> localhost; sonra VITE_API_URL (web dağıtımı).
// Örn. .env: VITE_API_URL=https://api.restoranim.com/api
const BASE_URL = TAURI_ORTAMI
  ? 'http://localhost:4091/api'
  : import.meta.env.VITE_API_URL || 'http://localhost:4091/api';

// Ürün resimleri /api olmadan, sunucu kökünden servis ediliyor (örn. /uploads/products/x.jpg)
export const API_ORIGIN = BASE_URL.replace(/\/api$/, '');
export const imageUrl = (path) => (path ? `${API_ORIGIN}${path}` : null);

// Müşteri QR menüsünün (musteri-menu/) çalıştığı adres — masa QR kodu
// üretiminde /:qrToken eklenerek kullanılır (bkz. src/pages/CustomerRequests.jsx).
export const CUSTOMER_MENU_URL = import.meta.env.VITE_CUSTOMER_MENU_URL || 'http://localhost:5174';

const client = axios.create({
  baseURL: BASE_URL,
});

// Her istekte, varsa token'ı otomatik ekle
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Token süresi dolmuşsa (401) otomatik login'e at
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
