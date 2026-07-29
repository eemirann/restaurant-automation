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

### Son kararlar (2026-07-29, ikinci tur)

- Puan harcama: **ücretsiz ürün** (sabit ₺ indirimi değil).
- PIN: backend'de tam çalışır durumda olacak ama **zorunlu değil** ve
  **ayrı tablo açılmayacak** (Customers tablosunda nullable kolon).
  Bu restoranın kendi kurulumunda PIN arayüzü hiç kullanılmayacak —
  sadece ileride isteyen bir işletme için altyapı olarak duracak.
- Aşağıdaki prompt, kullanıcının kendi Claude Code oturumuna
  yapıştırması için hazırlandı (bu oturumda uygulanmadı).

### Claude Code'a yapıştırılacak prompt

\`\`\`
Restoran Otomasyonu projesine (restoran-backend, restoran-panel,
musteri-menu) iki bağlı özellik ekle: (1) QR menüde kampanya/combo
karüseli, (2) kullanıcı adı bazlı müşteri sadakat sistemi. Aşağıdaki
kararlaştırılmış spesifikasyonu birebir uygula, varsayımda bulunma.

ÖNCE OKU: migrations/2026_07_31_qr_customer_menu.sql (aynı batch'te
yeni eklenen kolona referans veren ALTER/UPDATE'lerin EXEC() ile
ertelenmesi deseni), utils/orderBuilder.js (buildOrderInTransaction —
fiyat/stok'un tek doğruluk kaynağı), controllers/customerOrderController.js
(approveCustomerOrderRequest — bu fonksiyonu çağıran onay akışı),
controllers/publicMenuController.js (anonim uçlar deseni),
middleware/upload.js (ürün görseli yükleme — kampanya görseli için
AYNISINI kullan, yeni bir upload mekanizması kurma).

== 1) KAMPANYA / COMBO MOTORU ==

Yeni migration: migrations/2026_08_01_campaigns_and_loyalty.sql
(mevcut dosyalardaki IF NOT EXISTS + yorum deseniyle).

Tablolar:
- Campaigns: CampaignId, Title, Description NULL, ImageUrl NULL,
  StartAt, EndAt, DisplayOrder INT, IsActive BIT, CampaignType
  NVARCHAR(20) CHECK IN ('Info','Combo'), ComboOfferId INT NULL (FK)
- ComboOffers: ComboOfferId, Name, Price DECIMAL(10,2), IsActive BIT
- ComboOfferItems: ComboOfferId (FK), ProductId (FK), Quantity INT

Backend:
- controllers/campaignController.js — CRUD (Admin-only, requireRole
  deseni routes/tables.js'teki gibi), middleware/upload.js ile görsel
  yükleme
- routes/campaigns.js — yazma uçları Admin-only; ayrıca
  publicMenuController.js'e GET /public/menu/:qrToken/campaigns eklenir
  (sadece IsActive=1 VE StartAt<=GETDATE()<=EndAt olanlar, public rate
  limiter ile)
- utils/orderBuilder.js: buildOrderInTransaction'a opsiyonel Combos
  parametresi eklenir ([{ComboOfferId, Quantity}]). Her combo
  transaction içinde ComboOffers+ComboOfferItems'tan çekilip
  IsActive/tarih aralığı doğrulanır (HttpError fırlat). Her bileşen
  ProductId kendi OrderDetail satırı olarak eklenir (mevcut
  deductStockForItem ile stok/BOM aynen düşer — KDS gerçek ürünleri
  görsün). OrderDetails'e nullable ComboOfferId sütunu eklenip fiyat
  satırlara değil combo'nun sabit Price'ına eşitlenecek şekilde
  dağıtılır (ilk satıra tam combo fiyatı, diğer bileşen satırlarına 0 —
  toplamda hep combo.Price çıkmalı). totalAmount hesaplaması buna göre
  güncellenir.
- POST /public/menu/:qrToken/order body'sine Combos alanı eklenir
  (createCustomerOrderRequest + CustomerOrderRequestItems/JSON
  deseniyle taslak olarak saklanır); approveCustomerOrderRequest zaten
  buildOrderInTransaction'ı çağırıyor, Combos'u aynen geçirir.

Frontend (restoran-panel):
- Yeni sayfa src/pages/Campaigns.jsx (Admin-only route, App.jsx +
  Layout.jsx nav item "Kampanyalar"), Products.jsx/ProductModal.jsx'teki
  görsel yükleme UI desenini örnek al.

Frontend (musteri-menu):
- Yeni src/components/CampaignCarousel.jsx, MenuView.jsx'in en üstüne
  (arama kutusundan önce) eklenir. Hem otomatik kayma (örn. 4-5sn
  interval) HEM parmakla kaydırma (touch event'leri) birlikte çalışır;
  kullanıcı manuel kaydırdığında otomatik interval sıfırlanıp birkaç
  saniye durur (çakışmasın diye). Kampanya boşsa bileşen hiç
  render edilmez. CampaignType='Combo' olan bir slayta dokununca combo
  detay modalı açılır (ProductDetailModal'a benzer, ComboOfferItems
  listesini gösterir, sepete {ComboOfferId, Quantity} olarak eklenir);
  'Info' ise sadece bilgi kartı, dokununca bir şey olmaz.
- i18n.jsx'e (musteri-menu'de az önce eklendi) yeni string'ler TR/EN
  ikisine de eklenir.

== 2) SADAKAT SİSTEMİ (kullanıcı adı bazlı) ==

Aynı migration dosyasında:
- Customers: CustomerId, Username NVARCHAR(50) NOT NULL (UNIQUE INDEX,
  case-insensitive karşılaştırma için mevcut DB collation'ı kullan ya
  da COLLATE Latin1_General_CI_AS belirt), Pin NVARCHAR(255) NULL
  (opsiyonel, SET EDİLİRSE bcrypt hash olarak saklanır — asla düz metin
  yazma), LoyaltyPoints INT NOT NULL DEFAULT 0, CreatedAt DATETIME
  DEFAULT GETDATE()
- AppSettings'e LoyaltyPointsRate DECIMAL(5,2) NOT NULL DEFAULT 10
  eklenir (100 TL başına kaç puan) — EArsivVatRate ile birebir aynı
  ALTER TABLE + EXEC deseni, controllers/settingsController.js VE
  restoran-panel Settings.jsx'e EArsivVatRate alanıyla aynı şekilde
  eklenir.
- CustomerOrderRequests'e nullable Username NVARCHAR(50) kolonu eklenir
  (checkout'ta müşteri girerse taşınır).
- Products'a nullable LoyaltyPointCost INT kolonu eklenir (admin bir
  ürünü "X puana bedava" işaretler) — restoran-panel
  ProductModal.jsx'e bu alan eklenir.

Backend:
- musteri-menu CartView.jsx checkout ekranına opsiyonel "Kullanıcı adın
  (puan kazanmak için)" input eklenir (i18n.jsx'e string eklenir);
  girilirse createCustomerOrderRequest body'sine Username olarak
  gönderilir.
- approveCustomerOrderRequest: CustomerOrderRequests.Username doluysa,
  transaction içinde Customers'ta o kullanıcı adını case-insensitive
  bul/yoksa oluştur, totalAmount * LoyaltyPointsRate / 100 kadar puan
  ekle (AppSettings'ten oku).
- Puan harcama (ücretsiz ürün): personel tarafında (Tables.jsx sipariş
  ekranına veya yeni bir arama/sekmeye) kullanıcı adı girilip
  Customers.LoyaltyPoints bakiyesine bakılan, LoyaltyPointCost <=
  bakiye olan ürünlerin "puanla öde" seçeneğiyle eklenebildiği bir akış
  kur. Bu da transaction içinde, aynı güvenlik prensibiyle (puan
  bakiyesi sunucuda tekrar kontrol edilir, ürün UnitPrice=0 olarak
  OrderDetail'e yazılır ama stok/BOM normal düşer, Customers.LoyaltyPoints
  o ürünün LoyaltyPointCost kadar azaltılır).
- PIN: SADECE backend'de tam çalışır olsun (Customers.Pin nullable,
  set edilmişse ileride bir doğrulama fonksiyonu/endpoint'i
  eklenebilecek şekilde altyapısı dursun). musteri-menu VEYA
  restoran-panel arayüzünde PIN girme/isteme UI'ı EKLEME — bu tur için
  kapsam dışı, sadece backend kapasitesi olarak dursun.

== TEST ==
- tests/ klasöründeki mevcut Jest + fakeDb mock deseniyle (bkz.
  tests/publicMenuController.test.js, tests/customerOrderController.test.js)
  yeni controller'lar (campaignController, güncellenen
  customerOrderController/orderBuilder) için test yaz.
- Mevcut TÜM testler (şu an 111/111) geçmeye devam etmeli — npm test.
- Her iki frontend'de (restoran-panel, musteri-menu) npm run build
  hatasız tamamlanmalı.
- Bitince commit + push (branch: claude/turkce-yazi-m3dfnh).
\`\`\`

---

## Kampanya + Sadakat Sonrası Durum ve Yeni Boşluklar (2026-08-03 civarı)

Kullanıcı yukarıdaki promptu kendi tarafında uyguladı ve pushladı
(`3e98e57`). Kod tabanı incelendi, şunlar artık gerçekten çalışıyor
(123/123 test yeşil):

- Kampanya/combo motoru (`controllers/campaignController.js`,
  `ComboOffers`/`ComboOfferItems`/`Campaigns`)
- Kullanıcı adı bazlı sadakat + puanla ücretsiz ürün
  (`controllers/loyaltyController.js` — `redeemLoyaltyProduct`,
  transaction içinde puan/uygunluk yeniden doğrulanıyor)
- Masa Alanları yönetimi (`tableAreaController.js`)
- Vergi/Fatura bilgileri + e-Fatura sağlayıcı ayarları (API key
  BİLEREK ayrı `InvoiceProviderSettings` tablosunda — `AppSettings`
  public okunduğu için oraya konmamış, iyi bir güvenlik kararı)
- Yazıcı ayarları (`KitchenAutoPrintEnabled`, `PrinterPaperWidth`)
- Bonus: Kafe bilgi notu + sosyal medya + iletişim paneli
  (musteri-menu sol panel için, planlanmamıştı ama iyi bir ek)
- musteri-menu tamamen beyaz/premium bir temaya geçirilmiş (ilk
  KOMA-tarzı koyu temadan vazgeçilmiş — kullanıcı kendi zevkine göre
  yeniden tasarlamış)

**Yeni tespit edilen boşluklar (öncelik sırasıyla):**

1. **Kampanya zamanlaması tek seferlik** — `Campaigns.StartAt`/`EndAt`
   sadece DATETIME aralığı, günlük tekrar eden "happy hour" desteği
   yok (oysa orijinal fikir "her gün X saatinde Y kampanyası" idi).
   Öneri: nullable `RecurringDailyStartTime`/`RecurringDailyEndTime`
   (TIME), doluysa `publicMenuController.js`'teki aktiflik sorgusuna
   `CAST(GETDATE() AS TIME) BETWEEN ...` eklenir.
2. **Müşteri kendi puanını göremiyor** — Username sadece puan
   kazanmak için toplanıyor, musteri-menu'de bakiye görüntüleme yok.
   Öneri: StaffView'e (ya da yeni sekmeye) rate-limitli, anonim bir
   "Puanlarım" görünümü (`publicMenuActionLimiter` deseniyle).
3. **Dashboard'da kampanya/sadakat analitiği yok** — `dashboardController.js`'de
   hiç sorgu yok. Öneri: en çok satılan combo, kaç farklı kullanıcı
   puan biriktirmiş, toplam harcanan puan (=verilen ücretsiz ürün)
   gibi metrikler (mevcut tek-endpoint-çoklu-sorgu desenine eklenir).

**Hâlâ yapılmamış eski öneriler:** Servis Ücreti + Bahşiş
(PaymentDrawer), Otomatik Yedekleme, Para Birimi.

**Durum:** Sadece fikir/tespit — henüz uygulanmadı, kullanıcı hangisini
önceliklendireceğine karar verecek.

---

## Beşli Paket: Kampanya Tekrarı + Puan Görünürlüğü + Dashboard + Bahşiş + Anket (2026-08-04)

Kullanıcı önceki 3 tespiti (kampanya günlük tekrar, müşteri puan
görünürlüğü, Dashboard analitiği) aynen onayladı, üstüne 2 yeni özellik
istedi: **Bahşiş** (QR menü sonunda, eklenip çıkarılabilir) ve
**3 kategorili emoji anket** (Lezzet/Hizmet/Temizlik). Aşağıdaki prompt
kullanıcının kendi Claude Code oturumuna yapıştırması için hazırlandı
(bu oturumda uygulanmadı).

### Claude Code'a yapıştırılacak prompt

\`\`\`
Restoran Otomasyonu projesine 5 bağlı iyileştirme ekle. Aşağıdaki
spesifikasyonu birebir uygula, varsayımda bulunma.

ÖNCE OKU: migrations/2026_08_01_campaigns_and_loyalty.sql,
controllers/campaignController.js, controllers/loyaltyController.js
(redeemLoyaltyProduct — transaction içinde sunucu tarafı doğrulama
deseni), controllers/publicMenuController.js (resolveTableByToken,
getPublicMenuStatus, rate limiter kullanımı), utils/orderBuilder.js
(buildOrderInTransaction), routes/loyalty.js (şu an SADECE personel
tarafı, verifyToken korumalı), middleware/rateLimiters.js
(publicMenuViewLimiter/publicMenuActionLimiter), controllers/
dashboardController.js (tek endpoint'te çoklu sorgu deseni),
restoran-panel/src/components/PaymentDrawer.jsx (QUICK_AMOUNTS deseni,
ödeme akışı).

Yeni migration: migrations/2026_08_04_recurrence_tips_feedback.sql
(mevcut dosyalardaki IF NOT EXISTS + yorum deseniyle).

== 1) KAMPANYA GÜNLÜK TEKRAR ==
Campaigns tablosuna nullable RecurringDailyStartTime TIME,
RecurringDailyEndTime TIME eklenir. Doluysa kampanya HER GÜN sadece o
saat aralığında aktif sayılır (StartAt/EndAt hâlâ "bu kampanya genel
olarak ne zamandan ne zamana kadar geçerli" tarih aralığını belirler,
ikisi birlikte çalışır: tarih aralığı İÇİNDE + günün o saatinde).
controllers/campaignController.js (public liste sorgusu) ve
controllers/publicMenuController.js (getPublicMenuCampaigns) aktiflik
sorgusuna `(RecurringDailyStartTime IS NULL OR CAST(GETDATE() AS TIME)
BETWEEN RecurringDailyStartTime AND RecurringDailyEndTime)` eklenir.
restoran-panel Campaigns.jsx yönetim formuna bu iki opsiyonel saat
alanı eklenir (boş bırakılırsa mevcut davranış — sürekli aktif — aynen
çalışmaya devam eder).

== 2) MÜŞTERİ KENDİ PUANINI GÖRSÜN ==
controllers/publicMenuController.js'e YENİ bir anonim fonksiyon:
getPublicMenuLoyaltyBalance(req, res) — GET
/public/menu/:qrToken/loyalty/:username. resolveTableByToken ile
qrToken doğrulanır (QR linkin kendisi zaten "bu masadasın" kanıtı),
Customers'ta Username case-insensitive aranır, bulunamazsa 404, varsa
{ Username, LoyaltyPoints } döner. routes/publicMenu.js'e
publicMenuViewLimiter ile eklenir (mevcut view limiter deseni).
musteri-menu StaffView.jsx'e yeni bir "Puanlarım" kartı: kullanıcı adı
input + "Bakiyeni Gör" butonu, sonucu (puan sayısı) gösterir. i18n.jsx'e
TR/EN string'ler eklenir.

== 3) DASHBOARD KAMPANYA/SADAKAT ANALİTİĞİ ==
controllers/dashboardController.js'deki mevcut tek-endpoint-çoklu-sorgu
Promise.all (ya da benzeri) desenine 3 yeni sorgu eklenir:
- En çok satılan combo (OrderDetails.ComboOfferId IS NOT NULL,
  ComboOffers ile JOIN, adet bazında GROUP BY, ilk 5)
- Kaç farklı Username puan biriktirmiş (COUNT(DISTINCT) Customers)
- Toplam harcanan puan / verilen ücretsiz ürün sayısı (OrderDetails
  WHERE UnitPrice = 0 AND ProductId IN (LoyaltyPointCost IS NOT NULL
  olan ürünler) — ya da LOYALTY_REDEEM audit log'undan sayılabilir,
  utils/audit.js'teki mevcut logAudit kayıtlarına bakılabilir)
restoran-panel Dashboard.jsx'e bu 3 metrik için küçük widget'lar
eklenir (mevcut widget'larla aynı görsel dil).

== 4) BAHŞİŞ (QR menü sonunda, eklenip çıkarılabilir) ==
Orders tablosuna nullable TipAmount DECIMAL(10,2) DEFAULT 0 eklenir.
musteri-menu CartView.jsx'te "Siparişi Gönder" butonundan hemen önce
bir bahşiş seçici: hızlı yüzde butonları (Yok / %5 / %10 / %15) +
serbest tutar girişi, ara toplam (itemsTotal+combosTotal) üzerinden
hesaplanır, seçilen tutar sepetin toplamına eklenir ve TipAmount olarak
sipariş isteğine eklenir (createCustomerOrderRequest body'sine
TipAmount, CustomerOrderRequestItems'a değil CustomerOrderRequests'e
kendi kolonu olarak — request onaylanınca approveCustomerOrderRequest
bunu buildOrderInTransaction'a geçirip Orders.TipAmount'a yazar).
GÜVENLİK: TipAmount sunucuda da doğrulanır (negatif olamaz, mantıksız
büyük olamaz — örn. ara toplamın en fazla %50'si gibi bir üst sınır).
restoran-panel PaymentDrawer.jsx'te ödeme toplamına TipAmount ayrı bir
satır olarak eklenir, personel silebilir/değiştirebilir (mevcut
QUICK_AMOUNTS input deseni gibi düzenlenebilir bir alan — "çıkarmalı"
gereksinimini karşılar, müşterinin seçtiği bahşiş son sözü değildir,
kasada değiştirilebilir/kaldırılabilir).

== 5) ANKET (3 kategori, emoji, Lezzet/Hizmet/Temizlik) ==
Yeni tablo Feedback: FeedbackId, TableId (FK Tables), TasteRating
TINYINT CHECK (1-3), ServiceRating TINYINT CHECK (1-3),
CleanlinessRating TINYINT CHECK (1-3), CreatedAt DATETIME DEFAULT
GETDATE(). Anonim, oturum/ziyaret sınırı YOK (aynı masada birden fazla
kez gönderilebilir — bu bir "memnuniyet nabzı", katı bir tekillik
kontrolüne gerek yok).
controllers/publicMenuController.js'e createFeedback(req, res) — POST
/public/menu/:qrToken/feedback, body: { TasteRating, ServiceRating,
CleanlinessRating } (1-3 arası doğrulanır), publicMenuActionLimiter ile
korunur.
musteri-menu StaffView.jsx'in altına (Sipariş Durumu'ndan sonra) yeni
bir "Deneyiminizi Değerlendir" kartı: 3 satır (Lezzet/Hizmet/Temizlik),
her satırda 3 emoji butonu (örn. 😞 😐 😄), gönderince "Teşekkürler"
mesajı gösterilip kart o oturumda tekrar gönderilemez hale gelir
(sadece client-side state, backend'de tekrar engeli yok). i18n.jsx'e
TR/EN string'ler eklenir.
restoran-panel'de bu verinin görülebileceği bir yer: Dashboard.jsx'e
(madde 3'teki widget'larla birlikte) ortalama Lezzet/Hizmet/Temizlik
puanı widget'ı eklenebilir (opsiyonel, zaman kalırsa).

== TEST ==
tests/ klasöründeki mevcut Jest + fakeDb mock deseniyle yeni/değişen
fonksiyonlar için test yaz. Mevcut TÜM testler (şu an 123/123) geçmeye
devam etmeli — npm test. Her iki frontend'de (restoran-panel,
musteri-menu) npm run build hatasız tamamlanmalı. Bitince commit + push
(branch: claude/turkce-yazi-m3dfnh).
\`\`\`

**Durum:** Henüz uygulanmadı — kullanıcı kendi tarafında uygulayacak.

---

## Sıradaki Fikirler İçin

Yeni beyin fırtınası oturumlarında buraya eklenecek başlıklar için boşluk.
