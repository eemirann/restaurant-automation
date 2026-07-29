/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // restoran-panel ile aynı renk paleti (tutarlı marka görünümü) —
        // burada tema anahtarı yok, sabit koyu tema (mockup'taki gibi).
        ink: '#1C1B19',
        cream: '#F7F4EE',
        ember: '#FF4713',
        moss: '#00C853',
        azure: '#0090FF',
        charcoal: '#0A0806',
        panel: '#1A150F',
        hairline: '#2C251B',
        paper: '#F3ECE0',
        slate: '#BEB5A7',
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
