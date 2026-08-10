/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sidebar (Layout.jsx) zaten koyu tasarlanmıştı — light/dark switch'ten etkilenmez, sabit.
        ink: '#1C1B19',
        cream: '#F7F4EE',
        // Ayarlar sayfasından değiştirilebilir (bkz. SettingsContext) — CSS
        // değişkenine bağlı, diğer sabit renkler gibi hex değil.
        ember: 'rgb(var(--color-ember) / <alpha-value>)',
        moss: '#00C853',
        azure: '#0090FF',
        sand: '#E8E1D3',
        // Sayfa içeriği: CSS değişkenine bağlı — index.css'teki :root/.dark bloklarına göre değişir.
        slate: 'rgb(var(--color-slate) / <alpha-value>)',
        charcoal: 'rgb(var(--color-charcoal) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        hairline: 'rgb(var(--color-hairline) / <alpha-value>)',
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
      },
      fontFamily: {
        // Superdesign taslağıyla ("Kompakt Masa Yönetimi") aynı tek font ailesi —
        // Zodiak+Satoshi ikilisinin yerini aldı, bkz. index.css'teki Google Fonts import'u.
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      // rounded-sm uygulamanın HER yerinde (~380 kullanım) kullanılan ana köşe
      // yarıçapı — tek satırda yumuşatınca hiçbir bileşen dosyasına dokunmadan
      // tüm uygulama daha yumuşak/modern görünür (bkz. Superdesign taslağı).
      borderRadius: {
        sm: '0.625rem',
      },
    },
  },
  plugins: [],
}
