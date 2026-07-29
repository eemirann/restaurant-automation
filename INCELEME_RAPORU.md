# Restoran Otomasyonu — Baştan Sona İnceleme Raporu

**Tarih:** 2026-07-29
**Kapsam:** Backend (kök dizin, Node.js/Express + MSSQL) ve `restoran-panel/` (React+Vite) — aktif frontend olduğu doğrulandı.

> Not: `restoran-panel-new` (sadece `node_modules`, gerçek `package.json` yok) ve `restaurant-panel` (kökte 1 byte'lık boş bir dosya, dizin bile değil) terk edilmiş/başlamamış denemeler. Gerçek ürün `restoran-panel` içinde.

---

## 1. Tam Çalışır Durumdaki Özellikler

Backend tarafında **18 controller/route çifti** de gerçek DB mantığıyla uçtan uca çalışıyor; stub/sahte veri bulunamadı. Frontend tarafında **17 sayfanın 17'si** de gerçek API'lere bağlı, mock veri kullanan ya da işlevsiz buton içeren sayfa yok.

Uçtan uca (backend+frontend) tam çalışan özellikler:

- **Giriş (PIN ile)**: personel listesi → PIN pad → JWT, rol bazlı yönlendirme
- **Siparişler**: masa/adisyon oluşturma, ürün/ekstra/şurup ekleme, miktar güncelleme, ürün silme, sipariş iptali (Admin), fiyatlar sunucuda hesaplanıyor (client'tan güvenilmiyor)
- **Masalar**: canlı bakiye/ürün sayısı, sürükle-bırak masa transfer/birleştirme (satır kilitleme ile race condition koruması), hızlı ödeme, salon/alan filtreleme
- **Mutfak Ekranı (KDS)**: canlı kuyruk, soket ile anlık güncelleme, durum ilerletme
- **Ödemeler**: tam/kısmi/ürün bazlı ödeme, iade, iptal (soft delete), vardiya bazlı kasa takibi
- **Stok & Reçete (BOM)**: reçete tanımlı ürünlerde satış sonrası otomatik stok düşümü/iade, alım kaydı, hareket geçmişi
- **Vardiya Yönetimi**: aç/kapa, admin için zorla kapatma/çıkış/devir, beklenen nakit hesabı
- **Raporlar**: satış, Z-raporu, ürün bazlı — CSV dışa aktarım dahil
- **Dashboard**: günlük/haftalık/saatlik ciro, kâr oranı, çok satanlar, düşük stok, kategori dağılımı — tek endpoint'te 8 sorgu
- **Ürün/Ekstra/Şurup/Kategori/Kullanıcı/Ayarlar/Denetim (Audit)**: standart CRUD, hepsi rol bazlı korunuyor
- **Rezervasyonlar (görüntüleme)**: çakışma/tampon süre kontrolü backend'de var, listeleme frontend'de var (bkz. Bölüm 2 — oluşturma/iptal arayüzü eksik)
- Gerçek zamanlı katman (Socket.IO, JWT doğrulamalı) masa/KDS güncellemelerini anlık yayıyor

---

## 2. Backend'de Var, Frontend'de Eksik Olanlar

Bunlar **API hazır ama arayüzü yok/eksik** — en somut kazanç fırsatları burada:

| # | Özellik | Backend Endpoint | Durum |
|---|---|---|---|
| 1 | **Rezervasyon oluşturma/iptal** | `POST /reservations`, `PATCH /reservations/:id/cancel` | Tables.jsx sadece `GET /reservations` ile listeliyor; yeni rezervasyon alma veya iptal etme arayüzü yok. Çakışma kontrolü gibi geliştirilmiş backend mantığı boşa duruyor. |
| 2 | **Kategori yönetimi (CRUD)** | `POST/PUT/DELETE /categories` | Frontend'de sadece `GET /categories` kullanılıyor (ürün formunda dropdown için). Kategori ekleme/düzenleme/silme için ayrı bir sayfa/arayüz yok. |
| 3 | **Ödeme geri alma (restore)** | `PATCH /payments/:id/restore` | İptal edilen bir ödemeyi geri almak için backend hazır ama Payments.jsx'te buton yok (sadece void/refund var). |
| 4 | **Stok kalemi düzenleme** | `PUT /stock/:id` | Stock.jsx'te yeni stok ekleme, ±1 artır/azalt, silme ve alım var; ama mevcut bir stok kaleminin adı/birimi/min. eşiği gibi alanlarını düzenleyen bir "düzenle" arayüzü yok. |
| 5 | **Şifre ile giriş (`POST /auth/login`)** | mevcut | Frontend sadece PIN girişini kullanıyor; klasik kullanıcı adı/şifre girişi hiç çağrılmıyor. Kasıtlı bir tasarım kararı olabilir ama teyit edilmeli. |

---

## 3. Var Olan Özelliklerde Yarım/Ölü Kalmış Kısımlar

- **`Tables.jsx` içindeki `BillModal` (adisyon/fatura görünümü) tetiklenemiyor.** Modal tam kodlanmış, state (`quickBillTableId`) ve render koşulu mevcut, ama onu açan hiçbir buton yok — kodda "hayalet" bir özellik.
- **`ShiftWorkflow.jsx` içindeki `ShiftStatusCard`** bileşeni export edilmiş ama hiçbir yerde import/render edilmiyor (yorum satırı "yüzen kart kaldırıldı" diyor) — ölü kod.
- **Vardiya muafiyeti tutarsızlığı:** `ShiftContext.jsx` yorumunda "Admin vardiya açmaktan muaf" yazıyor ve `SHIFT_ROLES` sabiti tanımlanmış, ama `Layout.jsx`'te `requiresShift = !!user` olduğu için **Admin dahil herkes** vardiya açmaya zorlanıyor. `SHIFT_ROLES` hiçbir yerde kullanılmıyor. Niyet ile gerçek davranış birbirini tutmuyor — gerçek bir mantık hatası.
- **Fiş/fatura gönderimi (WhatsApp/e-posta/yazdır)** aslında backend'e hiç gitmiyor; sadece `wa.me` linki veya `mailto:` açıyor. Kullanıcıya "gönderildi" hissi verse de gerçek bir gönderim/loglama yok — bilinçli bir tasarım olabilir ama gözden geçirilmeli.
- **Sessizce yutulan hatalar:** İkincil veri çekmeleri (`.catch(() => {})`) ürün/masa/kullanıcı adı çözümlemede kullanılıyor; bu çağrılar başarısız olursa kullanıcıya hiç hata gösterilmiyor, sadece "Ürün #123" gibi placeholder görünüyor — gerçek bir arka uç kesintisini maskeleyebilir.
- **Enter ile form gönderme tutarsız:** `ExtraFormModal`/`SyrupFormModal`'da submit butonu `type="button"`, bu yüzden Enter'a basınca form gönderilmiyor; `ProductModal` ve sipariş oluşturma modalında ise `type="submit"` doğru kullanılmış.

---

## 4. Kod Kalitesi / Güvenlik Bulguları

**Yetkilendirme tutarsızlıkları (çoğu kasıtlı, belgelenmesi gerek):**
- `GET /api/dashboard` sadece `verifyToken` istiyor, rol kontrolü yok — herhangi bir Garson, `reports.js`'te Cashier/Admin'e kısıtlanan ciro/kâr marjı verilerini Dashboard üzerinden görebiliyor. **Tutarsızlık.**
- `PATCH /kds/items/:id/status` rol kısıtı yok — her personel mutfak kalemini "hazır/servis edildi" işaretleyebiliyor. Muhtemelen kasıtlı ama belgelenmemiş.
- `stock.js` (görüntüleme) ve `tables.js` transfer endpoint'i rol kısıtı yok; kodda "toggle ile ileride kısıtlanabilir" yorumu var — bilinen, kabul edilmiş bir eksik.
- Ödemede indirim uygulama yetkisi (`Cashier`/`Admin`) route middleware'inde değil, controller içinde kontrol ediliyor — işlevsel olarak doğru ama route dosyasına bakarak anlaşılamıyor, tutarsız desen.

**SQL enjeksiyon riski (düşük, tek örnek):**
- `productController.js` `saveProductOptions` fonksiyonunda ID'ler string olarak sorguya eklenmiş (`IN (${ids.join(',')})`). Önceden `typeof === 'number'` kontrolü olduğu için pratikte istismar zor, ama kod tabanındaki **tek** parametrize edilmemiş sorgu bu — tutarlılık için düzeltilmeli.

**Doğrulama eksiklikleri (küçük):**
- `stockController.js` `increaseStock`/`decreaseStock`'ta `amount` için sayı tipi kontrolü yok (diğer tüm sayısal alanlarda var).

**Hata mesajı tutarsızlığı:**
- Bazı controller'lar `{ error: ... }`, bazıları `{ message: ... }` döndürüyor — frontend her iki anahtarı da kontrol etmek zorunda kalıyor.
- Bazı catch blokları (`authController`, `paymentController`) ham `err.message`'ı doğrudan client'a döndürüyor — SQL Server hata metni (kısıtlama adları vb.) sızabilir.

**İyi uygulamalar (övgüye değer):**
- Tüm parolalar/JWT secret `.env`'den okunuyor, kod içinde hardcoded gizli bilgi yok.
- Rol/aktiflik bilgisi her istekte DB'den tazeleniyor (JWT'ye güvenilmiyor) — deaktive edilen kullanıcı token süresi dolmadan da engelleniyor.
- Transaction kullanımı (sipariş, ödeme, masa birleştirme) tutarlı ve rollback güvenli.
- Rate limiting (login ve genel API) mevcut.
- Rol bazlı arayüz gizleme (route + nav + sayfa içi buton seviyesinde) genel olarak tutarlı.

---

## 5. Genel Öneriler — "Bu Restorana Daha Ne Eklenebilir?"

**Hızlı kazanımlar (mevcut altyapıyı tamamlama):**
1. Rezervasyon oluşturma/iptal arayüzü ekle — backend zaten hazır (Bölüm 2, #1).
2. Kategori yönetim sayfası ekle (Bölüm 2, #2).
3. `BillModal`'ı bir butona bağla, `ShiftStatusCard`'ı ya kullan ya da kaldır (Bölüm 3).
4. Admin vardiya muafiyeti hatasını düzelt (niyet neyse ona göre kod veya yorumu düzelt).
5. Hata gövdesi formatını (`error` vs `message`) tek bir standarda indir.

**Orta vadeli, restoranın günlük operasyonuna değer katacak yeni özellikler:**
- **Müşteri/sadakat sistemi**: tekrar eden müşteri, puan/indirim, doğum günü kampanyası — mevcut sipariş/ödeme altyapısına kolayca oturur.
- **Online sipariş/paket servis entegrasyonu ya da basit QR-menü**: mevcut ürün/kategori/ekstra verisi zaten var, sadece müşteri tarafı bir arayüz gerekir.
- **Personel performans/satış raporu**: hangi garson/kasiyer ne kadar ciro yaptı — `reports.js` altyapısı genişletilebilir, `orderController` zaten `UserId` tutuyor.
- **Stok için otomatik düşük-stok bildirimi** (push/e-posta) — Dashboard zaten "düşük stok" hesaplıyor, sadece bildirim katmanı eksik.
- **Masa rezervasyon takvimi görünümü** (haftalık/aylık) — rezervasyon backend'i zaten çakışma kontrolü yapıyor, sadece görsel takvim eksik.
- **Fiş/adisyon gerçek yazdırma entegrasyonu** (termal yazıcı/ESC-POS) — şu an sadece tarayıcı üzerinden "yazdır" simülasyonu var.
- **Denetim (Audit) sayfasına filtre/arama iyileştirmesi** ve kritik olaylar için (ör. toplu iptal, admin şifre sıfırlama) anlık uyarı.
- **Çoklu şube desteği** eğer restoran büyürse — şu an tek şube varsayımıyla tasarlanmış görünüyor (DB şeması kontrol edilmeli).

---

## Sonraki Adım

Yukarıdaki maddelerden hangisini/hangilerini önce ele almak istersiniz? Örn: "önce rezervasyon arayüzünü ve kategori yönetimini ekle", ya da "önce vardiya muafiyeti bug'ını düzelt". Seçtiklerinize göre uygulamaya geçebilirim.
