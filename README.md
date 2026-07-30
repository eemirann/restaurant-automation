# Restoran Backend

Restoran POS / masa yönetimi için REST API + Socket.IO gerçek zamanlı bildirim sunucusu.
**Node.js + Express 5 + Microsoft SQL Server (`mssql`) + Socket.IO** ile yazılmıştır.

Beraberinde bir React (Vite) yönetim paneli `restoran-panel/` klasöründedir; bu README backend'i kapsar.

---

## Özellikler

- **Kimlik doğrulama:** kullanıcı adı/şifre + 4 haneli PIN girişi (JWT, `bcryptjs`)
- **Rol bazlı yetki (RBAC):** Waiter (Garson), Cashier (Kasiyer), Admin
- **Ürün & kategori** yönetimi, ürün görseli yükleme (`multer`)
- **Sipariş:** sunucu tarafında fiyat doğrulama, kalem ekleme/çıkarma/adet güncelleme, iptal
- **Ödeme:** kısmi & kalem bazlı ödeme, indirim, bahşiş, iade, yumuşak silme
- **Masa:** durum yönetimi, taşıma (Move) ve birleştirme (Merge) + transfer logu
- **Rezervasyon** (temel)
- **Stok:** kesirli (gr/ml) miktar, hareket geçmişi, alım kaydı, düşük stok uyarısı, maliyet/kâr
- **Reçete (BOM):** menü ürünü satılınca içindeki hammaddeler otomatik düşer
- **Mutfak Ekranı (KDS):** kalem bazında hazırlanma durumu + Socket.IO bildirimi
- **Dashboard & Raporlar:** canlı özet, tarih aralığı satış raporu, gün sonu Z-raporu, ürün kâr raporu, CSV export
- **Güvenlik:** `helmet`, CORS whitelist, giriş uçlarında rate limit, merkezi hata yönetimi

---

## Kurulum

```bash
# 1) Bağımlılıklar
npm install

# 2) Ortam değişkenleri
cp .env.example .env
#   -> .env içindeki DB bilgileri ve JWT_SECRET'i doldurun
#      (JWT_SECRET boşsa sunucu başlamaz)

# 3) Veritabanı şeması (migrations/) - aşağıdaki sıraya göre çalıştırın

# 4) Geliştirme sunucusu
npm run dev      # nodemon ile
# veya
node server.js
```

Sunucu varsayılan olarak `http://localhost:4091` üzerinde çalışır (`PORT` ile değiştirilebilir).

### Ortam Değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` | MSSQL bağlantısı |
| `JWT_SECRET` | **Zorunlu.** Token imzalama anahtarı. Boşsa sunucu başlamaz. |
| `PORT` | HTTP portu (varsayılan 4091) |
| `NODE_ENV` | `production` ise morgan `combined` log formatı kullanır |
| `CORS_ORIGIN` | İzinli origin'ler, virgülle ayrılmış. Boşsa tüm origin'lere izin (yalnızca geliştirme). |

---

## Veritabanı Migration'ları

`migrations/` altındaki `.sql` dosyaları **dosya adı (tarih) sırasına göre** elle çalıştırılır
(ayrı bir migration aracı yoktur). Hepsi `IF NOT EXISTS` ile korumalıdır; tekrar çalıştırmak güvenlidir.

| Sıra | Dosya | İçerik |
|------|-------|--------|
| 1 | `2026_07_22_base_schema.sql` | Çekirdek tablolar + `Paid` trigger'ı (koddan yeniden kurgulandı; canlı DB ile doğrulayın) |
| 2 | `2026_07_23_capacity_nullable.sql` | `Tables.Capacity` → NULL |
| 3 | `2026_07_23_raw_materials.sql` | `Products.IsRawMaterial` + gizli "Hammadde" kategorisi |
| 4 | `2026_07_23_stock_movements.sql` | `StockMovements` tablosu |
| 5 | `2026_07_23_stock_purchases.sql` | `StockPurchases` tablosu |
| 6 | `2026_07_23_add_payment_items.sql` | `PaymentItems` (kalem bazlı ödeme) |
| 7 | `2026_07_24_add_product_cost.sql` | `Products.Cost` |
| 8 | `2026_07_24_add_user_pin.sql` | `Users.PinHash` |
| 9 | `2026_07_27_recipes.sql` | `Recipes` tablosu (BOM) |
| 10 | `2026_07_27_stock_decimal.sql` | `Stock`/`StockMovements`/`StockPurchases` miktarları → `DECIMAL(10,3)` |
| 11 | `2026_07_27_kds.sql` | `OrderDetails.PrepStatus` + `PreparedAt` (KDS) |
| ... | *(bu tablo, aradan geçen migration'ların tümünü kapsamıyor — Extras/Syrups/Shifts/Audit/Ürün Seçenekleri vb. için `migrations/` klasörüne bakın)* | |
| N | `2026_07_31_qr_customer_menu.sql` | `Tables.QrToken` + `CustomerOrderRequests`(+Items) + `ServiceRequests` (müşteri QR menüsü) |

> **Not:** `2026_07_22_base_schema.sql` uygulama kodundan yeniden kurgulanmıştır ve canlı
> şemanın birebir kopyası olmayabilir. Mevcut bir veritabanında hiçbir şeyi değiştirmez
> (IF NOT EXISTS). Kesin şema için canlı DB'den script üretip (SSMS "Generate Scripts" veya
> `mssql-scripter`) karşılaştırın.

---

## API Uçları

Taban yol: `/api`. `VT` = JWT gerekir (`Authorization: Bearer <token>`).

### Auth — `/api/auth`
| Metod | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/register` | VT + Admin | Yeni personel oluştur |
| POST | `/login` | herkes (rate-limited) | Kullanıcı adı/şifre girişi |
| GET | `/staff` | herkes | PIN ekranı için personel listesi |
| POST | `/login-pin` | herkes (rate-limited) | UserId + PIN ile giriş |

### Products — `/api/products` · Categories — `/api/categories`
| Metod | Yol | Yetki |
|-------|-----|-------|
| GET | `/`, `/:id` | VT |
| POST / PUT / DELETE / PATCH | (yazma uçları) | VT + Admin |
| POST | `/:id/image` (products) | VT + Admin |

### Orders — `/api/orders`
| Metod | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| POST | `/` | VT | Sipariş oluştur (fiyat sunucuda hesaplanır) |
| GET | `/`, `/:id` | VT | Listele / detay |
| POST | `/:id/items` | VT | Kalem ekle |
| PATCH | `/:id/items/:itemId` | VT | Kalem adedi güncelle |
| DELETE | `/:id/items/:itemId` | VT | Kalem çıkar |
| PATCH | `/:id/status` | VT | Pending ↔ Served |
| PATCH | `/:id/cancel` | VT + Admin | İptal (stok geri eklenir) |

### Payments — `/api/payments`
| Metod | Yol | Yetki |
|-------|-----|-------|
| POST | `/` | VT (indirim yalnızca Cashier/Admin) |
| GET | `/order/:orderId`, `/order/:orderId/balance` | VT |
| DELETE `/:id` · PATCH `/:id/restore` · POST `/:id/refund` | | VT + Admin |

### Tables — `/api/tables` · Reservations — `/api/reservations`
| Metod | Yol | Yetki |
|-------|-----|-------|
| GET | `/`, `/:id` | VT |
| PATCH | `/:id/status` | VT |
| POST | `/:tableId/transfer` | VT |
| POST / PATCH / DELETE (tables) | | VT + Admin |
| GET (reservations) | `/` | VT |
| POST `/` · PATCH `/:id/cancel` (reservations) | | VT + Cashier/Admin |

### Users — `/api/users`  (tümü VT + **Admin**)
`GET /`, `GET /:id`, `PATCH /:id/role`, `PATCH /:id/reset-password`, `PATCH /:id/pin`, `PATCH /:id/deactivate`, `PATCH /:id/reactivate`

### Stock — `/api/stock`
| Metod | Yol | Yetki |
|-------|-----|-------|
| GET | `/`, `/movements` | VT |
| POST / PUT / DELETE / PATCH · `/:id/purchase` | | VT + Admin |

### Recipes (BOM) — `/api/recipes`
| Metod | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/:productId` | VT | Ürünün reçetesi (hammadde + miktar + stok) |
| POST | `/` | VT + Admin | Reçeteye hammadde satırı ekle |
| PUT | `/:id` | VT + Admin | Satır güncelle |
| DELETE | `/:id` | VT + Admin | Satır sil |

### KDS (Mutfak) — `/api/kds`
| Metod | Yol | Yetki | Açıklama |
|-------|-----|-------|----------|
| GET | `/queue` | VT | Hazırlanacak kalemler (`?status=all` ile Ready dahil) |
| PATCH | `/items/:orderDetailsId/status` | VT | Kalem durumu (New/Preparing/Ready/Served) |

### Reports — `/api/reports`  (VT + Cashier/Admin)
| Metod | Yol | Açıklama |
|-------|-----|----------|
| GET | `/sales?from=&to=&format=csv` | Tarih aralığı satış + yöntem kırılımı |
| GET | `/z-report?date=&format=csv` | Gün sonu Z-raporu |
| GET | `/products?from=&to=&format=csv` | Ürün bazlı satış & kâr |

### Dashboard — `/api/dashboard`  (VT)
`GET /` — canlı özet (bugünkü ciro, masalar, düşük stok, haftalık/saatlik ciro, çok satanlar, kâr oranı…)

### Müşteri QR Menüsü — `/api/public/menu/:qrToken`  (KİMLİK DOĞRULAMASIZ, rate-limitli)
Masaya özel, tahmin edilemez bir token (`Tables.QrToken`) ile erişilir. Ayrı bir mini
uygulama olan `musteri-menu/` bu uçları kullanır. Müşterinin gönderdiği sipariş
**doğrudan `Orders`'a yazılmaz** — personel onaylayana kadar `CustomerOrderRequests`'te
"Pending" bekler (bkz. `controllers/publicMenuController.js`).

| Metod | Yol | Açıklama |
|-------|-----|----------|
| GET | `/:qrToken` | Masa bilgisi + aktif menü |
| GET | `/:qrToken/options/:productId` | Bir ürüne bağlı ekstra/şurup seçenekleri |
| POST | `/:qrToken/order` | Sipariş İSTEĞİ oluştur (onay bekler) |
| POST | `/:qrToken/request` | Hızlı hizmet isteği (garson çağır/hesap/su/peçete/çatal-bıçak) |
| GET | `/:qrToken/status` | Son sipariş isteğinin durumu + bekleyen hizmet istekleri |

### Customer Orders — `/api/customer-orders` · Service Requests — `/api/service-requests`  (VT — personel tarafı)
| Metod | Yol | Açıklama |
|-------|-----|----------|
| GET | `/customer-orders?status=Pending` | Bekleyen müşteri sipariş isteklerini kalemleriyle listele |
| POST | `/customer-orders/:id/approve` | Onayla — gerçek `Orders` kaydı oluşturur (fiyat sunucuda yeniden hesaplanır) |
| POST | `/customer-orders/:id/reject` | Reddet |
| GET | `/service-requests?status=Pending` | Bekleyen hizmet isteklerini listele |
| PATCH | `/service-requests/:id/resolve` | İsteği çözümlendi olarak işaretle |

Masa QR kodları (Admin): `GET /api/tables/qrcodes` — `restoran-panel`'deki
"Müşteri İstekleri" sayfasından üretilip yazdırılabilir.

---

## Roller

| Rol | Yetki özeti |
|-----|-------------|
| **Waiter** (Garson) | Sipariş/masa akışı, ödeme (indirimsiz) |
| **Cashier** (Kasiyer) | Garson + indirim uygulama, rezervasyon, raporlar |
| **Admin** | Tümü + kullanıcı/ürün/stok/reçete yönetimi, iptal/iade |

---

## Socket.IO Olayları

Bağlantı JWT ile doğrulanır: `io(url, { auth: { token } })`. Origin, `CORS_ORIGIN` ile sınırlanır.

| Olay | Yön | Payload | Açıklama |
|------|-----|---------|----------|
| `tables:changed` | sunucu → istemci | yok | Masa/sipariş/ödeme değişti → istemci `GET /api/tables` ile tazelenir |
| `kds:new` | sunucu → istemci | `{ orderId, tableId? }` | Mutfağa yeni kalem düştü → `GET /api/kds/queue` |
| `kds:updated` | sunucu → istemci | `{ orderDetailsId, orderId, prepStatus }` | Bir kalemin hazırlanma durumu değişti |
| `customerRequests:new` | sunucu → istemci | `{ type: 'order'\|'service', tableId, tableNumber, ... }` | Müşteri QR menüsünden yeni sipariş/hizmet isteği geldi → `GET /api/customer-orders` veya `/api/service-requests` |

> Olaylar tüm kimlik-doğrulanmış istemcilere yayınlanır; ilgili ekran (KDS/kasa/masa) kendi olayını dinler.

---

## Docker ile Dağıtım

Tam yığın (MSSQL + backend + panel + müşteri QR menüsü) `docker-compose.yml` ile gelir.

```bash
# 1) Kök dizinde .env oluştur (en az JWT_SECRET ve DB_PASSWORD gerekli)
cp .env.example .env
#    DB_PASSWORD güçlü olmalı (MSSQL politikası: büyük/küçük harf + rakam + sembol)

# 2) Ayağa kaldır
docker compose up -d --build

# 3) İlk kurulumda bir kez: veritabanını oluştur + migration'ları uygula
docker compose exec db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa \
  -P "$DB_PASSWORD" -C -Q "IF DB_ID('RestoranDB') IS NULL CREATE DATABASE RestoranDB"
docker compose run --rm backend npm run migrate

# 4) İlk kurulumda bir kez: panele giriş yapabilecek ilk Admin kullanıcısını oluştur
#    (Users tablosu migration sonrası boştur, /register ucu sadece Admin'e açık —
#    bu script o döngüyü tek seferlik kırar; bkz. scripts/createFirstAdmin.js)
docker compose exec backend node scripts/createFirstAdmin.js "Ad Soyad" "kullaniciadi" "1234"
```

- **Panel:** http://localhost:8080  ·  **Müşteri Menü:** http://localhost:8081  ·  **Backend:** http://localhost:4091
- `VITE_API_URL` (her iki panel imajına) ve `VITE_CUSTOMER_MENU_URL` (sadece panel'e — masa QR
  kodlarının işaret edeceği adres) **build anında** gömülür — üretimde gerçek adresleri `.env`'de
  ayarlayın, ilgili imaj(lar)ı yeniden build edin.
- Ürün görselleri `uploads` volume'unda kalıcıdır; MSSQL verisi `mssql-data` volume'unda.
- Panel'i/müşteri menüsünü Docker'sız çalıştırmak için ilgili klasörde `.env` içinde
  `VITE_API_URL` (ve panel için `VITE_CUSTOMER_MENU_URL`) ayarlayıp `npm run build`/`npm run dev` kullanın.
- **İnternetsiz (USB'den) kurulum:** internet bağlantısı olmayan bir kasa/POS bilgisayarına tek bir
  çift-tıklamalı Türkçe sihirbazla kurmak için bkz. [`installer/README.md`](installer/README.md).

## Proje Yapısı

```
server.js            # giriş noktası, route kayıtları, middleware
config/              # db, socket, cors
controllers/         # iş mantığı + ham parametreli SQL
routes/              # URL -> controller eşlemesi
middleware/          # auth, upload, rateLimiters, errorHandler
utils/               # stockDeduction (BOM-farkında stok), orderBuilder (paylaşılan sipariş oluşturma)
migrations/          # tarih sıralı .sql şema betikleri
uploads/products/    # ürün görselleri (statik: /uploads)
restoran-panel/      # personel/yönetici React paneli (JWT ile giriş)
musteri-menu/        # müşteri QR menüsü — anonim, tek başına React uygulaması
```
