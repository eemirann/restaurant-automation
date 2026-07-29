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

## Kampanya + Sadakat Sistemi, QR Menüyle Entegre (2026-07-29)

QR menünün ilk açılış ekranına, sağa-sola kaydırılan bir reklam/kampanya
karüseli eklenmesi ve buna bağlı bir müşteri sadakat sistemi kurulması
konuşuldu. Kararlaştırılanlar:

- **Combo motoru gerçek olacak** (basit "vitrin ürünü" değil) — kampanya
  ürünleri kendi fiyat/bileşen tanımına sahip, backend'de doğrulanan
  gerçek bir yapı.
- **Sadakat kimliği: kullanıcı adı** (telefon numarası değil), aynı
  kullanıcı adı iki kişi tarafından kullanılamaz (UNIQUE, case-insensitive).
- **Puan kazanma oranı**: varsayılan **100₺ → 10 puan**, Ayarlar'dan
  değiştirilebilir olacak (`LoyaltyPointsRate`).
- **Kampanya yönetimi**: sadece Admin.
- **Karüsel**: hem otomatik kayma hem parmakla kaydırma (ikisi birden).

### Combo Motoru — veri modeli taslağı

- `Campaigns`: `CampaignId`, `Title`, `Description`, `ImageUrl`, `StartAt`,
  `EndAt`, `DisplayOrder`, `IsActive`, `CampaignType` (`Info` | `Combo`),
  `ComboOfferId` (nullable)
- `ComboOffers`: `ComboOfferId`, `Name`, `Price` (sabit kampanya fiyatı),
  `IsActive`
- `ComboOfferItems`: `ComboOfferId`, `ProductId`, `Quantity`

**Sipariş akışı**: Müşteri karüselde kampanyaya dokunur → combo detay
modalı → sepete `{ ComboOfferId, Quantity }` (normal `Items`'tan ayrı,
`POST /public/menu/:qrToken/order` payload'ına `Combos` alanı eklenir).

**Backend**: `buildOrderInTransaction` genişletilir — her combo için
`ComboOffers`+`ComboOfferItems` transaction içinde çekilir, `IsActive`/
tarih aralığı doğrulanır. Mutfağın gerçek ürünleri görmesi için her
bileşen kendi `OrderDetail` satırı olarak eklenir (KDS'te ayrı ayrı
görünür, stok her ürünün kendi reçetesinden düşer — mevcut BOM mantığı
aynen kullanılır). Fiyat satırlara değil **combo toplamına** sabitlenir;
bunun için `OrderDetails`'e nullable `ComboOfferId` sütunu eklenip
fiş/rapor tarafında gruplanabilir.

### Sadakat — kullanıcı adı ile

`Customers`: `CustomerId`, `Username` (UNIQUE, case-insensitive),
`LoyaltyPoints`, `CreatedAt`. Checkout'ta opsiyonel "Kullanıcı adın"
alanı; sipariş onaylanınca (`approveCustomerOrderRequest`) puan işlenir.

**Açık risk (henüz karara bağlanmadı):** Şifresiz, sadece kullanıcı
adıyla çalışan sistemde (1) başkası aynı adı bilip puanlara erişebilir,
(2) yazım hatası yapılırsa puanlar "kaybolur" (yeni kayıt açılır).
Öneri: opsiyonel 4 haneli PIN eklemek (banka güvenliği değil, sadece
hafif koruma). Karar kullanıcıya bırakıldı.

### Karüsel UX detayı

Otomatik kayma + parmakla kaydırma birlikte olacaksa, kullanıcı manuel
kaydırdığında otomatik zamanlayıcı sıfırlanıp bir süre durmalı —
yoksa otomatik kayma ile kullanıcı hareketi çakışır.

**Durum:** Henüz uygulanmadı — kullanıcı kendi tarafında (yerel Claude
Code oturumu) uygulayacak.

---

## Sıradaki Fikirler İçin

Yeni beyin fırtınası oturumlarında buraya eklenecek başlıklar için boşluk.
