import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // Üretimde bu proxy'yi nginx yapar (bkz. musteri-menu/nginx.conf).
    // Geliştirmede de aynı GÖRELİ '/api' adresinin çalışması için vite
    // dev sunucusu istekleri backend'e iletir — böylece geliştirme ile
    // üretim aynı kod yolunu kullanır (bkz. src/api/client.js).
    proxy: {
      '/api': 'http://localhost:4091',
      '/uploads': 'http://localhost:4091',
    },
  },
})
