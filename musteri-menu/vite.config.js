import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Üretimde proxy YOKTUR: menüyü backend'in kendisi servis eder, yani
    // göreli '/api' zaten aynı origin'deki API'ye gider (bkz. server.js).
    // Geliştirmede menü 5174'te, backend 4091'de ayrı çalıştığı için aynı
    // göreli adresin çalışması adına vite dev sunucusu istekleri iletir —
    // böylece geliştirme ile üretim aynı kod yolunu kullanır
    // (bkz. src/api/client.js).
    proxy: {
      '/api': 'http://localhost:4091',
      '/uploads': 'http://localhost:4091',
    },
  },
})
