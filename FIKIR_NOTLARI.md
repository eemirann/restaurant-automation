# Fikir Notları

Bu dosya, sohbet sırasında konuşulan ama henüz (ya da başka bir oturumda)
uygulanan fikir/öneri notlarını tutar — kod değil, referans amaçlı.

---

## Ayarlar Sayfası Yeniden Yapılandırması (2026-07-29)

Mevcut `Settings.jsx` sadece 5 alan tutuyordu: Restoran Adı, Vurgu Rengi,
Ürün Pop-up'ı aç/kapa, Stok Grafiği aç/kapa, e-Arşiv KDV oranı. Aşağıdaki
öneri, sayfayı sekmeli/bölümlü bir yapıya taşımak ve eksik alanları
tamamlamak için verildi.

**Önerilen bölümler:**

1. **Genel** — Restoran Adı (var), Logo (sidebar, giriş ekranı, QR menü
   üstü, fişler), Açılış/Kapanış Saati (QR menüde "şu an kapalı" göstermek
   için kullanım alanı var)
2. **Görünüm** — Vurgu Rengi (var), Açık/Koyu Tema anahtarı (panelin
   CSS-değişken temalı alt yapısı hazır ama Settings'te seçim yoktu), Dil
   (panel için TR/EN — müşteri menüsüne eklenen sistemin aynısı personel
   paneline de taşınabilir)
3. **Vergi & Fatura** — KDV oranı (var), Vergi No / Vergi Dairesi / Adres
   (invoiceController.js'de bu alanlar hiç yoktu; gerçek e-Arşiv
   entegratörüne geçişte zorunlu olacak), e-Fatura sağlayıcı ayarları
   (API key vb.)
4. **Sipariş & Ödeme** — Para Birimi (çoklu restoran/ülkeye satış
   düşünülüyorsa öncelikli), Servis Ücreti (%/sabit, PaymentDrawer'a
   eklenir), Bahşiş Seçenekleri (ödeme ekranında hazır yüzdelik butonlar)
5. **Donanım** — Yazıcılar (mutfak fişi / müşteri fişi için ayrı yazıcı
   seçimi, otomatik/manuel basım)
6. **Masa Alanları** — Alan isimlerini yönetme arayüzü (Area sütunu zaten
   var, adlandırma/ekleme arayüzü eksikti)
7. **Sistem** — Otomatik Yedekleme (SQL Server için zamanlanmış yedek)

**Öncelik önerisi:** Önce Vergi Bilgileri + Yazıcı Ayarları (zaten var olan
e-Fatura ve yazıcı özelliklerini gerçekten kullanılabilir hale getiriyor).
Para Birimi ve Otomatik Yedekleme en son (çoklu kurulum/satış hedefiyle
ilgili, daha büyük mimari karar gerektiriyor).

**Durum:** Kullanıcı bu işi kendi tarafında (yerel Claude Code oturumu)
uyguladı.

---

## Sıradaki Fikirler İçin

Yeni beyin fırtınası oturumlarında buraya eklenecek başlıklar için boşluk.
