/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Müşteri QR menüsünün KENDİ tasarım dili — restoran-panel'in koyu
        // POS temasıyla (ember/panel/charcoal) kasıtlı olarak hiçbir token
        // paylaşmaz. Premium, beyaz zeminli, editoryal bir görünüm hedefler.
        ink: '#15130F',      // birincil metin (sıcak, neredeyse siyah)
        paper: '#FFFFFF',    // sayfa zemini
        cream: '#F7F4EE',    // kart / yüzey zemini (yumuşak sıcak beyaz)
        line: '#E9E4D8',     // ince kenarlıklar
        muted: '#8D8677',    // ikincil / üçüncül metin
        gold: '#9C7A3C',     // vurgu (fiyat, aktif durum, ince highlight'lar)
        success: '#2F6844',  // onaylandı durumu (sönük, premium yeşil)
        danger: '#9B3B3B',   // reddedildi durumu (tuğla kırmızısı, çığlık atmayan)
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(21,19,15,0.04), 0 8px 24px -12px rgba(21,19,15,0.12)',
        lift: '0 4px 10px rgba(21,19,15,0.06), 0 16px 32px -16px rgba(21,19,15,0.18)',
      },
    },
  },
  plugins: [],
}
