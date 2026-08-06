// ============================================================
// AÇILIŞ/KAPANIŞ SAATİ — "şu an açık mı?" hesabı.
//
// openingTime/closingTime: "HH:MM" (24 saat) metin ya da null.
// İKİSİ DE NULL/boş ise kısıt yok kabul edilir — HER ZAMAN AÇIK (varsayılan,
// mevcut davranışı bozmaz; restoran çalışma saati girmemişse hiçbir şey
// kapanmaz).
//
// Gece yarısını geçen aralıklar (ör. 18:00-02:00) desteklenir: kapanış,
// açılıştan KÜÇÜKSE bu bir "ertesi güne taşan" aralık sayılır.
//
// NOT: Bu dosyanın musteri-menu/src/utils/businessHours.js'te AYNI mantıkla
// bir eşi vardır (backend ile frontend ayrı build/deploy edildiği için kod
// paylaşılamıyor) — biri değişirse diğeri de güncellenmeli.
// ============================================================

function isOpenNow(openingTime, closingTime, now = new Date()) {
    if (!openingTime || !closingTime) return true; // kısıt yok

    const [oh, om] = openingTime.split(':').map(Number);
    const [ch, cm] = closingTime.split(':').map(Number);
    if ([oh, om, ch, cm].some((n) => Number.isNaN(n))) return true; // bozuk veri -> engelleme

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const openMinutes = oh * 60 + om;
    const closeMinutes = ch * 60 + cm;

    if (openMinutes === closeMinutes) return true; // 24 saat açık kabul edilir

    if (openMinutes < closeMinutes) {
        // Aynı gün içinde biten normal aralık, ör. 09:00-23:00
        return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    }
    // Gece yarısını geçen aralık, ör. 18:00-02:00
    return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

module.exports = { isOpenNow };
