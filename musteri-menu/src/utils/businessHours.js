// ============================================================
// AÇILIŞ/KAPANIŞ SAATİ — "şu an açık mı?" hesabı.
//
// Bu dosyanın utils/businessHours.js (backend) içinde AYNI mantıkla bir eşi
// vardır — backend ile bu menü ayrı build/deploy edildiği için kod
// paylaşılamıyor, biri değişirse diğeri de güncellenmeli. Backend sipariş
// gönderilirken bunu YETKİLİ olarak (sunucu saatiyle) tekrar kontrol eder;
// buradaki hesap sadece "kapalı" banner'ını ANINDA göstermek içindir.
//
// openingTime/closingTime: "HH:MM" (24 saat) metin ya da null.
// İKİSİ DE NULL/boş ise kısıt yok kabul edilir — HER ZAMAN AÇIK.
// ============================================================

export function isOpenNow(openingTime, closingTime, now = new Date()) {
  if (!openingTime || !closingTime) return true;

  const [oh, om] = openingTime.split(':').map(Number);
  const [ch, cm] = closingTime.split(':').map(Number);
  if ([oh, om, ch, cm].some((n) => Number.isNaN(n))) return true;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = oh * 60 + om;
  const closeMinutes = ch * 60 + cm;

  if (openMinutes === closeMinutes) return true;

  if (openMinutes < closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  // Gece yarısını geçen aralık, ör. 18:00-02:00
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}
