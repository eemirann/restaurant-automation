# Restoran Otomasyonu — Kurulum, Güncelleme ve Sorun Giderme

Bu doküman iki kişi için yazıldı:

- **Kuran/kullanan kişi** → "Sistem Nelerden Oluşuyor", "İlk Kurulum", "Güncelleme",
  "Sık Karşılaşılan Hatalar" bölümleri.
- **Geliştirici (paketi hazırlayan)** → "USB Paketini Hazırlama" ve
  "Geliştirici Notları" bölümleri.

> **Docker artık kullanılmıyor.** Sistem doğrudan Windows üzerinde çalışır:
> veritabanı **SQL Server Express**, sunucu ise bir **Windows Servisi**dir.
> Sanallaştırma (BIOS/VT-x) gereksinimi ortadan kalkmıştır.

---

## 1. Sistem Nelerden Oluşuyor

İki ayrı kurulum dosyası var ve **ikisi de aynı bilgisayara kurulur**:

| # | Kurulum | Ne kurar |
|---|---|---|
| 1 | `RestoranKurulumSihirbazi.exe` | SQL Server Express + veritabanı + **sunucu (Windows Servisi)** + müşteri QR menüsü |
| 2 | `RESTO POS_x.y.z_x64.msi` (Tauri) | **Yönetim paneli** (masaüstü uygulaması) |

Kurulumdan sonra kullanılan adresler:

| Ne | Adres |
|---|---|
| Yönetim paneli | Masaüstündeki **RESTO POS** uygulaması |
| Müşteri (QR) menüsü | `http://<sunucu-ip>:4091/<masa-qr-kodu>` |
| Backend / API | `http://localhost:4091/api` |
| Veritabanı | `localhost\SQLEXPRESS` (TCP 1433) |

### İkisi birbirine nasıl bağlanıyor?

RESTO POS masaüstü uygulaması **kendi içinde eksiksiz bir backend kopyası** ve
bir `node.exe` taşır (bu yüzden ~100 MB'tan büyüktür). Açılışta şunu yapar:

1. **4091 portu cevap veriyor mu diye bakar.**
2. **Cevap veriyorsa** → kendi backend'ini **başlatmaz**, var olana bağlanır.
3. **Cevap vermiyorsa** → kendi taşıdığı backend'i başlatır.

Windows Servisi bilgisayar açılışında 4091'i dinlemeye başladığı için, RESTO POS
açıldığında **her zaman 2. durumdadır**: port çakışması olmaz, tek bir backend çalışır.

> Bu yüzden **kurulum sırası önemlidir: önce sunucu, sonra RESTO POS.**

### Neden ikisi de gerekli?

RESTO POS'u tek başına da kurabilirsiniz, ama o zaman:

- **Veritabanı olmaz.** Uygulamanın taşıdığı backend'in bağlanacağı bir SQL Server
  yoktur; kurulum sihirbazı bunu kurar ve şifresini ayarlar.
- **QR menüsü çalışmaz.** Müşteri menüsü uygulamanın içine paketlenmez; onu
  kurulum sihirbazı yerleştirir.
- **Bilgisayar açılışında sunucu ayağa kalkmaz.** Uygulama kapalıyken backend de
  kapalıdır; mutfak ekranı, QR menü ve yedekleme çalışmaz.

---

## 2. İlk Kurulum (yeni bir bilgisayara)

### Gereksinimler

- Windows 10/11 (64-bit)
- **Yönetici hakkı** (servis kaydı ve SQL Server kurulumu için)
- En az 4 GB RAM (SQL Server Express ~1 GB kullanır)
- USB bellekte hazır **KurulumPaketi** klasörü
- Sanallaştırma/BIOS ayarı **gerekmez** (Docker döneminin şartıydı)

### Adım 1 — Sunucu ve veritabanı

1. USB'deki `KurulumPaketi` klasörünü hedef bilgisayara kopyalayın.
2. İçindeki **`RestoranKurulumSihirbazi.exe`** dosyasını çift tıklayın.
3. Sihirbaz size şunları sorar:
   - **Veritabanı şifresi** — otomatik güçlü bir şifre üretilir.
     **Bu şifreyi not alın**, sadece kurulum sonunda bir kez gösterilir.
   - **İlk yönetici** — Ad Soyad, kullanıcı adı, 4-6 haneli PIN.
4. "Kur" dedikten sonra kurulum otomatik ilerler. **SQL Server Express kurulumu
   birkaç dakika sürer ve ekranda ilerleme göstermez** — takılmış gibi görünse de bekleyin.
5. Sonunda "Kurulum tamamlandı!" penceresi çıkar ve veritabanı şifresi gösterilir.

Kurulum her şeyi `C:\RestoranOtomasyonu` klasörüne yapar. **Bu klasörü silmeyin** —
güncelleme ve yedekleme buradan yürür.

### Adım 2 — Yönetim paneli (RESTO POS)

1. `RESTO POS_x.y.z_x64.msi` (ya da `.exe`) dosyasını çalıştırın.
2. Kurulum bitince masaüstünde **RESTO POS** kısayolu oluşur.
3. Uygulamayı açın; 1. adımda belirlediğiniz kullanıcı adı ve PIN ile girin.

### Adım 3 — QR menü adresini ayarlayın

Masa QR kodlarının hangi adresi açacağını sisteme siz söylemelisiniz.

1. Sunucu bilgisayarın yerel IP'sini öğrenin — komut isteminde `ipconfig`,
   "IPv4 Address" satırı (ör. `192.168.1.50`).
2. Panelde **Ayarlar → Genel → "Müşteri QR Menüsü · Adres"** alanına yazın:

   ```
   http://192.168.1.50:4091
   ```

3. Kaydedin, sonra **masa QR kodlarını yeniden yazdırın**.

> `localhost` **yazmayın** — o adres yalnızca sunucu bilgisayarında çalışır,
> müşterinin telefonu açamaz.

### Kurulum sihirbazı elle ne yapıyor?

Dosyaları kopyalar, `.env` dosyasını yazar, sonra `postinstall.ps1`'i çalıştırır.
O script sırasıyla:

1. Node.js kurulu mu bakar (yoksa paketteki MSI ile sessizce kurar)
2. `kurulum-sql-express.ps1` → SQL Express sessiz kurulum, **TCP/IP'yi açar**,
   **Mixed Mode** kimlik doğrulamayı açar, `sa` şifresini ayarlar, 1433 portunu
   sabitler, güvenlik duvarını açar, `RestoranDB` veritabanını oluşturur
3. Müşteri menüsü derlenmemişse derler
4. `node scripts\migrate.js` → tabloları kurar
5. `node scripts\createFirstAdmin.js` → ilk yöneticiyi oluşturur
6. `servis-kur.ps1` → NSSM ile **`RestoranBackend`** Windows Servisini kaydeder
7. `http://localhost:4091/api` gerçekten cevap veriyor mu diye doğrular

Kurulum yarıda hata verirse bu script'i **tek başına tekrar çalıştırabilirsiniz**
(baştan kurmaya gerek yok, adımlar tekrar çalıştırılmaya uygundur):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\postinstall.ps1"
```

---

## 3. Güncelleme

Veritabanındaki verileriniz (ürünler, siparişler, kullanıcılar) güncellemede
**silinmez** — SQL Server'a ve `RestoranDB`'ye hiç dokunulmaz.

### Sunucu tarafı

**A) Geliştirici bilgisayarında paketi hazırlayın**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1

# Müşteri menüsü de değiştiyse:
powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1 -MenuyuDerle

# package.json bağımlılıkları değiştiyse (paket çok büyür):
powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1 -BagimliliklarDegisti
```

Proje kökünde **`Guncelleme\`** klasörü oluşur.

**B) USB ile taşıyın**

`Guncelleme\` klasörünün **içindeki dosyaları** hedef bilgisayarda
`C:\RestoranOtomasyonu` klasörüne kopyalayın (üzerine yazsın).

> `.env` dosyası pakette **yoktur**, üzerine yazılmaz — şifreleriniz korunur.

**C) Hedef bilgisayarda uygulayın**

PowerShell'i **Yönetici olarak** açıp:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\guncelle.ps1"
```

Script: servisi durdurur → yeni migration'ları uygular → servisi başlatır →
4091'in cevap verdiğini doğrular.

### Panel tarafı

Yeni RESTO POS kurulumunu (`.msi`) çalıştırmanız yeterli, üzerine kurar.
Panel ile sunucu ayrı güncellenebilir — API yolu (`/api`) ve port (4091)
sabit tutulduğu için eski panel yeni sunucuyla çalışmaya devam eder.

---

## 4. Ürünleri/menüyü başka bir kuruluma taşıma

Panelde hazır bir özellik var — veritabanını elle kopyalamanıza gerek yok.

1. **Kaynak bilgisayarda:** Panel → **Ürünler** → sağ üstte **"⇩ Dışa Aktar"**.
   Bir JSON dosyası iner (kategoriler, ürünler, varyantlar, ekstralar, şuruplar, reçeteler).
2. Dosyayı USB ile hedef bilgisayara taşıyın.
3. **Hedef bilgisayarda:** Admin olarak girin → Ürünler → **"⇧ İçe Aktar"** → dosyayı seçin.

Bilmeniz gerekenler:

- Eşleştirme **isme göre** yapılır: aynı isimde ürün varsa **güncellenir**, yoksa
  **yeni oluşturulur**. Aynı dosyayı birden fazla kez içe aktarmak güvenlidir.
- **Ürün görselleri dahil değildir** (dosya olarak ayrı taşınmalı).
- **Canlı stok adetleri dahil değildir.**
- Bu butonları sadece **Admin** rolündeki kullanıcılar görebilir.

---

## 5. Sık Karşılaşılan Hatalar ve Çözümleri

### Panel açılıyor ama "sunucuya ulaşılamıyor" diyor

Servis çalışmıyor olabilir. Yönetici PowerShell'de:

```powershell
Get-Service RestoranBackend
```

`Running` değilse başlatın ve logu okuyun:

```powershell
Start-Service RestoranBackend
Get-Content C:\RestoranOtomasyonu\logs\servis-hata.log -Tail 40
```

### Servis başlamıyor / hemen duruyor

En sık üç neden:

1. **`.env` içinde `JWT_SECRET` yok** — sunucu bunu bilerek reddeder ve çıkar.
2. **Veritabanına bağlanamıyor** — `DB_SERVER` / `DB_PASSWORD` hatalı.
3. **4091 portu başka bir programda.** Kim tuttuğuna bakın:

   ```powershell
   Get-NetTCPConnection -LocalPort 4091 -State Listen |
     Select-Object OwningProcess, @{n='Ad';e={(Get-Process -Id $_.OwningProcess).ProcessName}}
   ```

   `RESTO POS` ya da `node` çıkarsa: masaüstü uygulaması kendi backend'ini
   başlatmış demektir (servis kurulmadan önce açılmış olabilir). Uygulamayı
   tamamen kapatın, sonra `Start-Service RestoranBackend`.

### "Login timeout expired" / veritabanına bağlanılamıyor

```powershell
Get-Service 'MSSQL$SQLEXPRESS'
```

- `Stopped` ise: `Start-Service 'MSSQL$SQLEXPRESS'`
- `Running` ama yine bağlanmıyorsa, TCP/IP kapanmış olabilir. Yapılandırmayı
  yeniden uygulayın (tekrar çalıştırılabilir):

  ```powershell
  powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\kurulum-sql-express.ps1" -SaSifre "<.env'deki DB_PASSWORD>"
  ```

### QR menüsü telefonda açılmıyor

Sırayla kontrol edin:

1. **Adres doğru mu?** Ayarlar → Genel → "Müşteri QR Menüsü · Adres" değeri
   `http://<yerel-ip>:4091` olmalı — `localhost` **olmamalı**.
2. **Telefon aynı Wi-Fi'da mı?** Mobil veriyle çalışmaz (bkz. Bölüm 8).
3. **Güvenlik duvarı 4091'e izin veriyor mu?**

   ```powershell
   Get-NetFirewallRule -DisplayName "*4091*"
   ```

4. **Menü derlenmiş mi?** `C:\RestoranOtomasyonu\musteri-menu\dist\index.html`
   dosyası olmalı. Yoksa sunucu logunda "Müşteri menüsü derlenmemiş" uyarısı görürsünüz.
5. **QR kodları adres değiştikten sonra yeniden yazdırıldı mı?**

### "-File" parametresi tanınmıyor / komut hata veriyor

Türkçe klavyede **`-FİLE`** (noktalı büyük İ) yazılmış olabilir — PowerShell bunu
tanımaz. Komutu birebir şöyle yazın (İ değil, I):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\postinstall.ps1"
```

### "SQL Server Express sessiz kurulumu başarısız oldu"

Ayrıntılı günlük şurada:
`C:\Program Files\Microsoft SQL Server\<sürüm>\Setup Bootstrap\Log\Summary.txt`

Sık nedenler: aynı isimde yarım kalmış bir instance, parola politikasını
karşılamayan `sa` şifresi (en az 8 karakter; büyük+küçük harf, rakam, sembol),
eksik Windows güncellemesi.

Daha önce **farklı bir `sa` şifresiyle** kurulmuşsa şifreyi Windows kimliğiyle sıfırlayın:

```powershell
sqlcmd -S localhost\SQLEXPRESS -E -Q "ALTER LOGIN sa WITH PASSWORD='<yeni>'; ALTER LOGIN sa ENABLE;"
```

### ".env dosyası bulunamadı"

Script'i yanlış klasörde çalıştırıyorsunuz. Kurulumun yapıldığı klasörde
(varsayılan `C:\RestoranOtomasyonu`) olmalı. Proje kaynak klasöründen
(`restoran-backend\installer\...`) doğrudan çalıştırmayın.

### "UYARI: İlk admin oluşturulamadı — muhtemelen bu kullanıcı adı zaten var"

**Bu bir hata değildir.** Kurulum ikinci kez çalıştırıldığında normaldir; admin
kullanıcısı zaten oluşturulmuştur. Mevcut bilgilerinizle giriş yapabilirsiniz.

Yeni kullanıcı için panelden **Kullanıcılar** sayfasını kullanın, ya da:

```powershell
cd C:\RestoranOtomasyonu
node scripts\createFirstAdmin.js "Ad Soyad" "kullaniciadi" "1234"
```

---

## 6. USB Paketini Hazırlama (geliştirici)

İnternete bağlı, kodun bulunduğu makinede:

```powershell
# 1) Bağımlılıkları kur, müşteri menüsünü derle, KurulumPaketi\ klasörünü oluştur
powershell -ExecutionPolicy Bypass -File scripts\paketle.ps1
```

Sonra elle eklenecekler:

2. **`installer\nssm.exe`** — [nssm.cc/download](https://nssm.cc/download) →
   `win64\nssm.exe`. Kurulum programının **içine gömülür**, bu yüzden Inno Setup
   derlemesinden **önce** konmalı.
3. **`SQLEXPR_x64_ENU.exe`** — Microsoft'tan "SQL Server 2022 Express" →
   *Download Media* → *Express Core*. **`KurulumPaketi\`** klasörüne konur.
4. **`node-vXX.X.X-x64.msi`** — hedef makinede Node.js yoksa gerekir.
   **`KurulumPaketi\`** klasörüne konur.
5. [Inno Setup 6](https://jrsoftware.org/isinfo.php) ile
   `installer\RestoranKurulum.iss` derlenir (IDE'de aç → *Compile*).
   Çıkan `RestoranKurulumSihirbazi.exe` otomatik olarak `KurulumPaketi\` içine düşer.
6. **RESTO POS masaüstü paketi** ayrı derlenir:

   ```powershell
   npm run masaustu:derle
   ```

   Çıktı: `src-tauri\target\release\bundle\msi\` (ve `nsis\`).
   Bu dosyayı da `KurulumPaketi\` klasörüne kopyalayın.
7. `KurulumPaketi\` klasörünün **tamamını** USB belleğe kopyalayın.

---

## 7. Geliştirici Notları

### PowerShell script'leri UTF-8 **BOM ile** kaydedilmeli

Windows PowerShell 5.1, `-File` ile çalıştırılan bir `.ps1` dosyasında BOM yoksa
dosyayı sistem ANSI kod sayfasıyla okur. Türkçe karakterler bozulur (`Ã§`, `Ä±`)
ve **parse hatası** oluşur — özellikle uzun tire (`—`) ANSI'de `â€"` olur ve
içindeki tırnak dizeleri erkenden bitirir. Bir script'i düzenledikten sonra
BOM'u geri koymak için:

```powershell
$p = 'installer\servis-kur.ps1'
$c = [System.IO.File]::ReadAllText($p, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($true)))
```

### `$degisken:` — kapsam niteleyicisi tuzağı

Çift tırnaklı dizede `"...\$servisAdi:(OI)"` yazarsanız PowerShell `$servisAdi:`
kısmını **kapsam (scope) niteleyicisi** sanır ve sözdizimi hatası verir.
İki nokta üst üste gelecekse `${degisken}` kullanın:

```powershell
icacls $klasor /grant "NT SERVICE\${servisAdi}:(OI)(CI)M" /T
```

### `[CmdletBinding()]` + `$PSScriptRoot` tuzağı

Bu ortamda `[CmdletBinding()]` kullanılan script'lerde `$PSScriptRoot`,
**parametre varsayılan değeri içinde boş gelir**. Bu yüzden `$PSScriptRoot`
doğrudan `param()` bloğunda kullanılmaz; gövdede
`$MyInvocation.MyCommand.Path` yedeğiyle çözülür.

### `PORT=4091` ve `/api` sabittir

RESTO POS masaüstü uygulaması, backend adresini (`http://localhost:4091/api`)
**derleme anında** içine gömer (bkz. `scripts/masaustu-hazirla.mjs` — panel
`VITE_API_URL` sabitlenerek derlenir) ve Tauri CSP'si de yalnızca bu adrese
bağlanmaya izin verir. Portu ya da API yolunu değiştirmek **var olan tüm
masaüstü kurulumlarını bozar**; değiştirilecekse panel de yeniden derlenip
yeniden dağıtılmalıdır.

### Masaüstü uygulaması kendi backend'ini taşır

`src-tauri/backend-dist` (backend kopyası) + `src-tauri/binaries/node-*.exe`
(sidecar) uygulamanın içine paketlenir (`scripts/masaustu-hazirla.mjs`).

`src-tauri/src/main.rs` açılışta şu sırayı izler:

1. **4091 cevap veriyor mu?** → ona bağlan, kendi kopyasını başlatma.
2. **`RestoranBackend` servisi kurulu ama duruyor mu?** → `sc start` ile
   başlatmayı dene, portun açılmasını 20 sn bekle.
3. Hiçbiri olmadıysa → gömülü kopyayı başlat.

2. adım olmadan, duran bir servis sessizce **eski** gömülü backend'in devreye
girmesine yol açıyordu (ikisi de aynı veritabanına bağlanır). 2. adım da
başarısız olursa (yönetici hakkı yok) gömülü kopyaya düşülür ama bu durum
kaydedilir: panel `backend_bilgisi` komutuyla hangi kaynağın kullanıldığını,
gömülü sürümü ve servis durumunu okuyabilir.

`backend-dist` içine `musteri-menu/dist`, `scripts/migrate.js` ve
`scripts/createFirstAdmin.js` de kopyalanır — gömülü backend devreye girdiğinde
QR menüsü ve `npm run migrate` çalışsın diye. `scripts/` klasörünün tamamı
kopyalanmaz (paketleme araçları pakete girmemeli).

Sürüm damgası: `backend-dist/SURUM.json` derleme anında yazılır
(`{ surum, derlemeZamani }`).

### Tek elemanlı dizi + splat tuzağı

`$dizi = $x | ForEach-Object {...}` tek eleman üretirse sonuç **dizi değil string**
olur ve `@dizi` splat'i onu karakter karakter argümana böler. `@( ... )` ile sarmalayın.

---

## 8. Faydalı Komutlar

Yönetici PowerShell'de:

```powershell
# --- Sunucu servisi ---
Get-Service RestoranBackend                     # durum
Restart-Service RestoranBackend                 # yeniden başlat
Stop-Service RestoranBackend                    # durdur
Get-Content C:\RestoranOtomasyonu\logs\servis-hata.log -Tail 40    # hata logu
Get-Content C:\RestoranOtomasyonu\logs\servis-cikti.log -Tail 40   # çıktı logu

# --- Veritabanı ---
Get-Service 'MSSQL$SQLEXPRESS'
sqlcmd -S localhost\SQLEXPRESS -U sa -P "<sifre>" -Q "SELECT name FROM sys.databases"

# --- Bakım ---
cd C:\RestoranOtomasyonu
node scripts\migrate.js                         # migration'ları elle uygula
node scripts\createFirstAdmin.js "Ad" "kadi" "1234"

# --- Kim 4091'i tutuyor? ---
Get-NetTCPConnection -LocalPort 4091 -State Listen |
  Select-Object OwningProcess, @{n='Ad';e={(Get-Process -Id $_.OwningProcess).ProcessName}}
```

> Yedekler `C:\RestoranOtomasyonu\db-backups\` klasöründedir. Bu klasörü
> düzenli olarak harici bir diske kopyalayın — otomatik yedek aynı bilgisayarda durur.

---

## 9. Bilinen Sınırlama: QR menü sadece yerel ağda çalışır

Müşteri menüsü sunucunun 4091 portundan yayınlanır. Bu adres **yalnızca
restoranın kendi ağındaki** cihazlardan açılabilir:

- Müşteri restoranın **Wi-Fi'sine bağlıysa** çalışır.
- Müşteri **mobil veri (4G/5G)** kullanıyorsa **çalışmaz.**

### ⚠️ Mobil veriye açacaksanız

Docker döneminde menü ayrı bir nginx konteynerindeydi ve o nginx **yalnızca**
anonim müşteri uçlarını (`/api/public/*`, `GET /api/settings`) dışarı veriyordu;
yönetim API'si internete hiç çıkmıyordu. **O filtre katmanı artık yok** — menü ve
yönetim API'si aynı portu paylaşıyor.

Bu yüzden **4091'i olduğu gibi port yönlendirme/tünel ile internete açmayın**;
tüm yönetim API'si de açılmış olur. Tünel veya ters proxy kullanacaksanız
yalnızca şu yollara izin verin:

```
/                 (menü sayfası ve /assets)
/api/public/*     (anonim müşteri uçları)
/api/settings     (yalnızca GET)
/uploads/*        (ürün görselleri)
```

Ayrıca yerel ağda her telefon backend'e kendi IP'siyle bağlandığı için hız
limitleri kişi başına işler; tünel arkasında tüm müşteriler tek IP'ye düşer ve
`middleware/rateLimiters.js` içindeki `apiLimiter` (15 dakikada 1000 istek)
yaklaşık 9 telefonda devreye girer — o senaryoda bu değer yükseltilmelidir.

### Garson çağırma hazır

Müşteri menüsünden gönderilen istekler (garson çağır, hesap, su, peçete,
çatal-bıçak) panelde **Müşteri İstekleri** sayfasında canlı görünür ve personel
"hallettim" ile kapatabilir.
