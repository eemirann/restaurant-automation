import axios from 'axios';

// Backend adresi. Öncelik: VITE_API_URL env (dağıtım için); yoksa yerel geliştirme.
// Örn. .env: VITE_API_URL=https://api.restoranim.com/api
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4091/api';

// Ürün resimleri /api olmadan, sunucu kökünden servis ediliyor (örn. /uploads/products/x.jpg)
export const API_ORIGIN = BASE_URL.replace(/\/api$/, '');
export const imageUrl = (path) => (path ? `${API_ORIGIN}${path}` : null);

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
