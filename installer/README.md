# Offline (USB) Kurulum Paketi

Restoran Otomasyonu'nun **backend + veritabanını** internet bağlantısı olmayan
bir kasa/POS bilgisayarına, tek bir çift-tıklamalı Türkçe sihirbazla kurmak için.

## Mimari

| Bileşen | Eskiden (Docker) | Şimdi |
|---|---|---|
| Veritabanı | `mssql/server` konteyneri | **SQL Server Express** (Windows'a doğrudan kurulu) |
| Backend | `backend` konteyneri, `restart: unless-stopped` | **Windows Servisi** (`RestoranBackend`, NSSM ile) |
| Müşteri QR menüsü | `customer-menu` nginx konteyneri, `:8081` | **backend'in kendisi** statik servis eder, `:4091` |
| Yönetim paneli | `panel` nginx konteyneri, `:8080` | **Tauri masaüstü .exe** — bu sihirbazın KAPSAMI DIŞINDA |

### ⚠️ PORT 4091 SABİTTİR

`restoran-panel` Tauri ile ayrı bir masaüstü `.exe` olarak paketlenmiştir:
`dist/` dosyaları exe'nin içine gömülüdür ve backend adresi
(`http://localhost:4091`) **build anında** gömülmüştür. Backend'in dinlediği
port ya da API yolu (`/api`) değişirse **var olan exe backend'i bulamaz** ve
yeniden derlenmesi gerekir. Bu yüzden:

- `.env`'deki `PORT=4091` değiştirilmez,
- `servis-kur.ps1` Windows Servisine `PORT=4091`'i ayrıca ortam değişkeni
  olarak da geçirir (.env bozulsa bile servis 4091'i dinlesin diye).

## Nasıl çalışır (özet)

1. **Paketleme** — internete bağlı bir geliştirici makinesinde **bir kez**
   `scripts\paketle.ps1` çalıştırılır: backend üretim bağımlılıkları kurulur
   (`npm ci --omit=dev`), müşteri menüsü derlenir (`musteri-menu/dist`) ve
   repo kökünde `KurulumPaketi\` klasörü hazırlanır.
2. **nssm.exe** — [nssm.cc/download](https://nssm.cc/download) adresinden
   `win64\nssm.exe` indirilip **`installer\nssm.exe`** olarak kopyalanır
   (kurulum programının içine gömülür).
2b. **node.exe** — `scripts\masaustu-hazirla.mjs` çalıştıktan sonra oluşan
   `src-tauri\binaries\node-*.exe` dosyası **`installer\node.exe`** olarak
   kopyalanır (~88 MB, kurulum programının içine gömülür).
   Böylece hedef makinede Node.js kurulu olması **gerekmez** ve servis,
   sistemdeki Node sürümü değişse bile etkilenmez.
3. **Sihirbazı derleme** — [Inno Setup 6](https://jrsoftware.org/isinfo.php)
   ile `installer\RestoranKurulum.iss` derlenir (IDE'de aç → *Compile*, ya da
   `ISCC.exe installer\RestoranKurulum.iss`). Çıktı `OutputDir` gereği
   otomatik olarak `KurulumPaketi\` klasörüne düşer.
4. **Büyük ikili dosyalar** `KurulumPaketi\` klasörüne elle kopyalanır
   (repoda tutulmazlar):
   - `SQLEXPR_x64_ENU.exe` — SQL Server 2022 Express > *Download Media* >
     *Express Core*. **Zorunlu.** (Küçük indirici `SQL2022-SSEI-Expr.exe` de
     çalışır ama internet ister — USB kurulumu için tam paket kullanın.)
   - Node.js MSI'ına **GEREK YOKTUR** — taşınabilir `node.exe` kurulum
     programının içinde gelir (yukarıdaki 2b adımı).
5. `KurulumPaketi\` klasörünün **tamamı** USB belleğe kopyalanır. Hedef
   bilgisayarda `RestoranKurulumSihirbazi.exe` çift tıklanır.

## Sihirbaz hedef bilgisayarda ne yapar

1. SQL Server Express kurulu mu / kurulum dosyası var mı diye bakar.
2. Veritabanı şifresi (otomatik güçlü şifre önerilir) ve ilk yönetici
   (Ad Soyad / kullanıcı adı / PIN) bilgilerini sorar.
3. Dosyaları `C:\RestoranOtomasyonu`'na kopyalar, `.env`'i oluşturur.
4. `postinstall.ps1`'i çalıştırır:
   - Node.js yoksa paketteki MSI ile sessizce kurar,
   - `kurulum-sql-express.ps1` → SQL Express sessiz kurulum + **TCP/IP'yi aç**
     + **Mixed Mode** + sa şifresi + sabit 1433 portu + SQL Browser +
     güvenlik duvarı + `RestoranDB` oluşturma,
   - müşteri menüsü derlenmemişse derler,
   - `node scripts\migrate.js` (eskiden `docker compose run --rm backend npm run migrate`),
   - `node scripts\createFirstAdmin.js` (eskiden `docker compose exec backend node ...`),
   - `servis-kur.ps1` → NSSM ile `RestoranBackend` Windows Servisi + otomatik
     başlatma + çökünce yeniden başlatma + 4091 güvenlik duvarı kuralı,
   - son olarak `http://localhost:4091/api`'nin gerçekten yanıt verdiğini
     doğrular.

**Masaüstü kısayolu oluşturulmaz** — yönetim paneli artık ayrı dağıtılan
RESTO POS masaüstü uygulamasıdır.

## SQL Server Express'te neden ekstra yapılandırma gerekiyor?

Docker imajı "kutudan çıktığı gibi" TCP 1433'ü dinliyor ve Mixed Mode ile sa
hesabı açık geliyordu. SQL Server Express'in **varsayılanları bunun tersidir**:

| Ayar | Express varsayılanı | `kurulum-sql-express.ps1` ne yapar |
|---|---|---|
| TCP/IP protokolü | **Kapalı** | Kayıt defterinden `Enabled=1` |
| TCP portu | **Dinamik** | Tüm IP'lerde sabit `1433` |
| Kimlik doğrulama | Sadece Windows Auth | `LoginMode=2` (Mixed Mode) |
| `sa` hesabı | Devre dışı / şifresiz | Kurulumda `/SECURITYMODE=SQL /SAPWD=...` |
| SQL Browser | Devre dışı | Otomatik başlatma (instance adıyla bağlanmak için) |

`config/db.js` `DB_SERVER`'ın iki biçimini de anlar: `localhost` (port ile) ve
`localhost\SQLEXPRESS` (adlandırılmış instance — tedious'ta port ile birlikte
verilemediği için `DB_PORT` bu durumda yok sayılır).

## Müşteri QR menüsü neden kök (`/`) altında servis ediliyor?

`musteri-menu` build çıktısı varlıklarını mutlak yollarla (`/assets/...`)
çağırır ve React Router'ı basename'siz, QR rotasını da doğrudan kökte
(`/:qrToken`) tanımlar. Bir alt yola (`/menu`) taşımak `musteri-menu`'nün vite
`base` + router `basename` ayarlarının değiştirilip **yeniden derlenmesini**
gerektirirdi — uygulama kodu bu geçişte değişmiyor. Kökte servis edilince QR
linkleri şu biçimde çalışır:

```
http://<sunucu-ip>:4091/<masa-qr-kodu>
```

`GET /` ise sağlık ucu (`Restoran API calisiyor`) olarak **korunur** — QR
linkleri her zaman bir token içerdiği için menü bundan etkilenmez.

Kurulumdan sonra panelde **Ayarlar → Müşteri Menü Adresi** alanına
`http://<sunucu-ip>:4091` yazılmalıdır; masa QR kodları bu adrese göre üretilir.

### ⚠️ 4091'i internete AÇMAYIN

Docker kurulumunda menü ayrı bir nginx konteynerindeydi ve o nginx yalnızca
`/api/public/*` ile `GET /api/settings` uçlarını geçiriyordu. Cloudflare tüneli
de sadece o konteynere bağlandığı için **yönetim API'si internete hiç
çıkmıyordu.** Bu filtre katmanı artık yok: menü ve yönetim API'si aynı portu
(4091) paylaşıyor.

Yerel ağda durum değişmedi (backend 4091 zaten doğrudan erişilebilirdi), ama
menüyü mobil veriye açmak için 4091'i olduğu gibi tünellemek/port yönlendirmek
**tüm yönetim API'sini internete açar.** Gerekirse tüneli ya da ters proxy'yi
yalnızca şu yollara izin verecek şekilde yapılandırın:

```
/                 (menü SPA'sı ve /assets)
/api/public/*     (anonim müşteri uçları)
/api/settings     (yalnızca GET)
/uploads/*        (ürün görselleri)
```

### Hız limiti notu

`server.js` tüm `/api` trafiğine `apiLimiter`'ı uyguluyor (IP başına
15 dakikada 1000 istek) ve bu, müşteri menüsü için ayrıca hesaplanmış
`publicMenuViewLimiter`'dan (5 dakikada 8000) **daha dardır** — yani menüde
fiilen bağlayıcı olan limit `apiLimiter`'dır.

Docker'sız kurulumda bu bir sorun değil, hatta düzelme: her telefon backend'e
kendi yerel IP'siyle bağlandığı için limit kişi başına işliyor (8 sn'lik durum
yoklamasıyla telefon başına ~112 istek/15dk). Docker'da ise TÜM menü trafiği
nginx konteynerinin tek IP'siyle geliyordu ve ~9 telefonda tavan doluyordu.

Ancak menüyü bir tünel/ters proxy arkasına alırsanız tüm müşteriler yine tek
IP'ye düşer ve `apiLimiter` ~9 telefonda devreye girer. O senaryoda
`middleware/rateLimiters.js` içindeki `apiLimiter.max` değeri yükseltilmeli
(`publicMenuViewLimiter` ile tutarlı olacak şekilde).

## Güncelleme

`installer\guncelle.ps1`: servisi durdurur → `node scripts\migrate.js` →
servisi başlatır ve 4091'i doğrular. SQL Server servisine ve `RestoranDB`'ye
dokunmaz.

## Kaldırma

Sihirbazın kaldırma adımı `RestoranBackend` servisini durdurup siler.
**SQL Server Express ve `RestoranDB` bilerek kaldırılmaz** — restoranın tüm
verisi orada; silmek geri dönülemez veri kaybı olurdu.

## Test etme

Bu sihirbaz **gerçek bir Windows makinesinde** uçtan uca test edilmelidir.
`RestoranKurulum.iss`'in Inno Setup ile hatasız derlenmesi sözdiziminin doğru
olduğunu gösterir, ama gerçek bir kurulumu (SQL Express sessiz kurulumu,
Windows Servisi kaydı, veritabanı bağlantısı, Tauri panelinden giriş) YERİNE
GEÇMEZ — bunlar temiz/sanal bir Windows ortamında elle doğrulanmalıdır.

Doğrulanması gerekenler:

- [ ] `http://localhost:4091/api/products` → `401` (API ayakta)
- [ ] Mevcut RESTO POS masaüstü exe'si **yeniden derlenmeden** giriş yapabiliyor
- [ ] `services.msc` → `RestoranBackend` = Running / Automatic
- [ ] Bilgisayar yeniden başlatıldığında servis kendiliğinden ayağa kalkıyor
- [ ] Telefondan `http://<sunucu-ip>:4091/<masa-qr-kodu>` menüyü açıyor
- [ ] Panelden gece yedeklemesi (`db-backups\`) dosya üretiyor
