2# Restoran Otomasyonu — Kurulum, Güncelleme ve Sorun Giderme

Bu doküman iki kişi için yazıldı:

- **Kuran/kullanan kişi** → "İlk Kurulum", "Güncelleme", "Sık Karşılaşılan Hatalar" bölümleri.
- **Geliştirici (paketi hazırlayan)** → "USB Paketini Hazırlama" ve "Geliştirici Notları" bölümleri.

Sistem tamamen **Docker** üzerinde çalışır. Kurulan bilgisayara ayrıca SQL Server,
Node.js veya başka bir veritabanı programı **kurmanıza gerek yoktur** — hepsi
Docker imajlarının içinde gelir.

Kurulumdan sonra kullanılan adresler:

| Ne | Adres |
|---|---|
| Yönetim paneli | http://localhost:8080 |
| Müşteri (QR) menüsü | http://localhost:8081 |
| Backend / API | http://localhost:4091 |
| Veritabanı (SQL Server) | localhost:1433 |

---

## 1. İlk Kurulum (yeni bir bilgisayara)

### Gereksinimler

- Windows 10/11 (64-bit)
- **Sanallaştırma açık olmalı** (BIOS'ta Intel VT-x / AMD-V). Docker Desktop
  bunu gerektirir, kurulum sihirbazı bu ayarı sizin yerinize değiştiremez.
- En az 8 GB RAM önerilir (SQL Server tek başına ~2 GB kullanır).
- USB bellekte hazır **KurulumPaketi** klasörü.

### Adımlar

1. USB'deki `KurulumPaketi` klasörünü hedef bilgisayara kopyalayın
   (USB'den de çalıştırılabilir, ama diske kopyalamak daha hızlıdır).
2. Klasörün içindeki **`RestoranKurulumSihirbazi.exe`** dosyasını çift tıklayın.
3. Sihirbaz Docker Desktop'ı kontrol eder:
   - Kurulu değilse, aynı klasördeki `Docker Desktop Installer.exe`'yi başlatmayı
     teklif eder. **Docker Desktop kurulumu genellikle bilgisayarın yeniden
     başlatılmasını ister** — yeniden başlattıktan sonra `RestoranKurulumSihirbazi.exe`'yi
     **tekrar çalıştırın**.
4. Sihirbaz size şunları sorar:
   - **Veritabanı şifresi** — otomatik güçlü bir şifre üretilir. **Bu şifreyi not alın.**
     Sadece kurulum sonunda bir kez gösterilir.
   - **İlk yönetici** — Ad Soyad, kullanıcı adı, 4-6 haneli PIN. Panele bu bilgilerle gireceksiniz.
5. "Kur" dedikten sonra kurulum otomatik ilerler (Docker imajlarını yükleme adımı
   **birkaç dakika sürer**, imaj dosyası ~1.3 GB'dır — takılmış gibi görünse de bekleyin).
6. Bitince masaüstünde **"Restoran Paneli"** kısayolu oluşur. Panele, 4. adımda
   belirlediğiniz kullanıcı adı ve PIN ile girin.

> **Not:** Kurulum her şeyi `C:\RestoranOtomasyonu` klasörüne yapar. Bu klasörü
> silmeyin — güncelleme ve yedekleme buradan yürür.

### Kurulum sihirbazı elle ne yapıyor?

Merak ederseniz: dosyaları kopyalar, `.env` dosyasını yazar, sonra
`postinstall.ps1`'i çalıştırır. O script de sırasıyla:
Docker'ı kontrol eder → `docker load` (offline imajlar) → `docker compose up -d` →
SQL Server hazır olana kadar bekler → veritabanını oluşturur → migration'ları
uygular → ilk admin kullanıcısını oluşturur.

Kurulum yarıda hata verirse, bu script'i **tek başına tekrar çalıştırabilirsiniz**
(baştan kurmaya gerek yok, adımlar tekrar çalıştırılmaya uygundur):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\postinstall.ps1"
```

---

## 2. Güncelleme (kurulu bir bilgisayarı yeni sürüme geçirme)

Yeni bir özellik/düzeltme yaptığınızda, hedef bilgisayarı **baştan kurmanıza gerek yok**.
Veritabanındaki verileriniz (ürünler, siparişler, kullanıcılar) güncellemede **silinmez** —
veritabanı container'ına hiç dokunulmaz.

### A) Geliştirici bilgisayarında paketi hazırlayın

```powershell
# Hepsini paketle (backend + panel + müşteri menüsü)
powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1

# Ya da sadece değiştirdiğiniz servisi — çok daha küçük/hızlı paket
powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1 -Servisler panel
```

Proje kökünde **`Guncelleme\`** klasörü oluşur; içinde `guncelleme.tar`,
`migrations\` ve `guncelle.ps1` bulunur.

> Sadece paneli paketlerseniz dosya ~25 MB olur; hepsini paketlerseniz ~1.3 GB.
> Bu yüzden mümkünse `-Servisler` ile sınırlayın.

### B) USB ile taşıyın

`Guncelleme\` klasörünün **içindeki dosyaları** hedef bilgisayarda
`C:\RestoranOtomasyonu` klasörüne kopyalayın (üzerine yazsın).

### C) Hedef bilgisayarda güncellemeyi uygulayın

PowerShell'i **Yönetici olarak** açıp:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\guncelle.ps1"
```

Script: yeni imajları yükler → backend/panel/müşteri menüsü container'larını
yeniler → SQL Server'ı bekler → yeni migration'ları uygular.

Sonunda `Güncelleme tamamlandı!` yazısını görmelisiniz.

---

## 3. Ürünleri/menüyü başka bir kuruluma taşıma

Panelde hazır bir özellik var — veritabanını elle kopyalamanıza gerek yok.

1. **Kaynak bilgisayarda:** Panel → **Ürünler** sayfası → sağ üstte **"⇩ Dışa Aktar"**.
   Bir JSON dosyası iner (kategoriler, ürünler, varyantlar, ekstralar, şuruplar, reçeteler).
2. Dosyayı USB ile hedef bilgisayara taşıyın.
3. **Hedef bilgisayarda:** Admin olarak girin → Ürünler → **"⇧ İçe Aktar"** → dosyayı seçin.

Bilmeniz gerekenler:

- Eşleştirme **isme göre** yapılır: aynı isimde ürün varsa **güncellenir**, yoksa
  **yeni oluşturulur**. Bu yüzden aynı dosyayı birden fazla kez içe aktarmak güvenlidir.
- **Ürün görselleri dahil değildir** (dosya olarak ayrı taşınmalı).
- **Canlı stok adetleri dahil değildir** (bunlar her restoranın kendi operasyonel verisidir).
- Bu butonları sadece **Admin** rolündeki kullanıcılar görebilir.

---

## 4. Sık Karşılaşılan Hatalar ve Çözümleri

### "Login timeout expired" / "Failed to connect to db:1433"

SQL Server henüz açılmamış ya da çökmüş. Önce durumu kontrol edin:

```powershell
cd C:\RestoranOtomasyonu
docker compose ps -a
```

- `db` satırında **`Up`** yazıyorsa: SQL Server açılış aşamasındadır, 30-60 saniye
  bekleyip script'i tekrar çalıştırın (script zaten 60 saniye bekliyor).
- `db` satırında **`Exited (137)`** yazıyorsa: **bellek yetersizliğinden** container
  öldürülmüş. Docker Desktop → Settings → Resources → Memory değerini **en az 4 GB**
  yapın, sonra:
  ```powershell
  docker compose up -d db
  ```
- Ayrıntılı log için: `docker compose logs db`

### "Cannot bind argument to parameter 'Path' because it is an empty string."

`C:\RestoranOtomasyonu` içindeki script eski sürüm. Depodaki güncel dosyayı kopyalayın:

```powershell
Copy-Item "...\restoran-backend\installer\postinstall.ps1" "C:\RestoranOtomasyonu\postinstall.ps1" -Force
```

### "-File" parametresi tanınmıyor / komut hata veriyor

Türkçe klavyede **`-FİLE`** (noktalı büyük İ) yazılmış olabilir — PowerShell bunu
tanımaz. Komutu birebir şöyle yazın (İ değil, I):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\postinstall.ps1"
```

### "Docker Desktop çalışır duruma getirilemedi"

- Görev çubuğundaki balina simgesine bakın; **"Docker Desktop is running"** demeli.
- Docker Desktop'ı elle açıp tam yüklenmesini bekleyin (ilk açılış 1-2 dakika sürebilir),
  sonra kurulumu tekrar çalıştırın.
- Hâlâ olmuyorsa sanallaştırma kapalı olabilir: BIOS'ta **Intel VT-x / AMD-V**, Windows'ta
  **Denetim Masası → Programlar → Windows özelliklerini aç/kapat** altında
  **"Virtual Machine Platform"** ve **"Windows Subsystem for Linux"** açık olmalı.

### "images.tar bulunamadı" / "guncelleme.tar bulunamadı"

USB'deki klasörün **tamamı** kopyalanmamış. `KurulumPaketi` (kurulum için) veya
`Guncelleme` (güncelleme için) klasöründeki **tüm** dosyaların hedef klasörde
olduğundan emin olun. Bu dosyalar büyüktür, kopyalama yarıda kesilmiş olabilir.

### ".env dosyası bulunamadı"

Script'i yanlış klasörde çalıştırıyorsunuz. Kurulumun yapıldığı klasörde
(varsayılan `C:\RestoranOtomasyonu`) olmalı. Proje kaynak klasöründen
(`restoran-backend\installer\...`) doğrudan çalıştırmayın.

### "UYARI: İlk admin oluşturulamadı — muhtemelen bu kullanıcı adı zaten var"

**Bu bir hata değildir.** Kurulum script'i ikinci kez çalıştırıldığında normaldir;
admin kullanıcısı zaten oluşturulmuştur. Mevcut bilgilerinizle giriş yapabilirsiniz.

Yeni bir kullanıcı eklemek isterseniz panelden **Kullanıcılar** sayfasını kullanın,
ya da:

```powershell
docker compose exec backend node scripts/createFirstAdmin.js "Ad Soyad" "kullaniciadi" "1234"
```

### Panel açılmıyor / "bu siteye ulaşılamıyor"

```powershell
cd C:\RestoranOtomasyonu
docker compose ps
```

Tüm servisler (`db`, `backend`, `panel`, `customer-menu`) `Up` olmalı. Değilse:

```powershell
docker compose up -d
docker compose logs backend    # hata varsa burada görünür
```

### "port is already allocated" / port çakışması

Başka bir program 8080, 8081, 4091 veya 1433 portunu kullanıyor. O programı kapatın,
ya da `docker-compose.yml` içindeki port eşlemesini değiştirin (örn. `"8090:80"`).

---

## 5. USB Paketini Hazırlama (geliştirici)

İnternete bağlı, kodun bulunduğu makinede **bir kez**:

```powershell
# 1) İmajları derle/indir ve KurulumPaketi\ klasörünü oluştur
powershell -ExecutionPolicy Bypass -File scripts\paketle.ps1
```

Sonra:

2. [Docker Desktop Installer.exe](https://www.docker.com/products/docker-desktop)'yi
   indirip **`KurulumPaketi\`** klasörüne kopyalayın (script bunu indirmez).
3. [Inno Setup 6](https://jrsoftware.org/isinfo.php) ile `installer\RestoranKurulum.iss`
   dosyasını derleyin (IDE'de aç → *Compile*, ya da `ISCC.exe installer\RestoranKurulum.iss`).
   Çıkan `RestoranKurulumSihirbazi.exe` otomatik olarak `KurulumPaketi\` içine düşer.
4. `KurulumPaketi\` klasörünün **tamamını** USB belleğe kopyalayın.

---

## 6. Geliştirici Notları

### PowerShell script'leri UTF-8 **BOM ile** kaydedilmeli

Windows PowerShell 5.1, `-File` ile çalıştırılan bir `.ps1` dosyasında BOM yoksa
dosyayı sistem ANSI kod sayfasıyla okur. Bu durumda Türkçe karakterler bozulur
(`Ã§`, `Ä±` gibi) ve bazı satırlarda **parse hatası** oluşur. Bir script'i
düzenledikten sonra BOM'u geri koymak için:

```powershell
$p = 'scripts\paketle-guncelle.ps1'
$c = Get-Content $p -Raw -Encoding UTF8
[System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($true)))
```

### `[CmdletBinding()]` + `$PSScriptRoot` tuzağı

Bu ortamda `[CmdletBinding()]` kullanılan script'lerde `$PSScriptRoot`,
**parametre varsayılan değeri içinde boş gelir**. Bu yüzden script'lerde
`$PSScriptRoot` doğrudan `param()` bloğunda kullanılmaz; gövdede
`$MyInvocation.MyCommand.Path` yedeğiyle çözülür. Yeni script yazarken aynı
kalıbı izleyin.

### `docker compose config --images <servis>` filtrelemiyor

Kullanılan Compose sürümünde bu komut servis adına göre **süzmüyor**, tüm imajları
döndürüyor. `paketle-guncelle.ps1` bu yüzden imaj etiketini
`restoran-otomasyonu-<servis>:latest` kalıbından doğrudan üretir.

### `docker-compose.yml` içindeki `name:` alanı sabit

`name: restoran-otomasyonu` **bilerek sabittir**. Paketleme makinesindeki klasör adı
ile hedefteki `C:\RestoranOtomasyonu` farklı olduğu için, imaj etiketleri klasör adına
göre türetilseydi `docker compose up -d` offline yüklenen imajları bulamaz, kurulum bozulurdu.

### Tek elemanlı dizi + splat tuzağı

`$dizi = $x | ForEach-Object {...}` tek eleman üretirse sonuç **dizi değil string**
olur ve `@dizi` splat'i onu karakter karakter argümana böler. `@( ... )` ile
sarmalayın.

---

## 7. Faydalı Komutlar

Hepsi `C:\RestoranOtomasyonu` klasöründe çalıştırılır.

```powershell
docker compose ps                  # servislerin durumu
docker compose ps -a               # durmuş/çökmüş container'lar dahil
docker compose logs backend        # backend logları
docker compose logs db             # veritabanı logları
docker compose restart backend     # tek servisi yeniden başlat
docker compose up -d               # duran servisleri kaldır
docker compose down                # hepsini durdur (VERİ SİLİNMEZ)
docker compose run --rm backend npm run migrate   # migration'ları elle uygula
```

> `docker compose down` verileri silmez — veriler Docker volume'lerinde durur.
> Volume'leri de silen `docker compose down -v` komutunu **kullanmayın**,
> tüm veritabanı gider.

---

## 8. Bilinen Sınırlama: QR menü sadece yerel ağda çalışır

Masa QR kodları şu an panelde `VITE_CUSTOMER_MENU_URL` adresinden üretilir
(varsayılan `http://localhost:8081`). Bu adres **yalnızca restoranın kendi
ağındaki** cihazlardan açılabilir:

- Müşteri restoranın **WiFi'sine bağlıysa** çalışır (QR adresinin `localhost`
  değil, bilgisayarın yerel IP'si olacak şekilde ayarlanması gerekir, örn.
  `http://192.168.1.50:8081`).
- Müşteri **mobil veri (4G/5G)** kullanıyorsa **çalışmaz** — bu adrese internetten
  ulaşılamaz.

Mobil veriyle de çalışması için sistemin internete güvenli şekilde açılması gerekir
(Cloudflare Tunnel veya router'da port yönlendirme + dinamik DNS). Bu henüz
yapılandırılmamıştır.

Garson çağırma özelliği ise **hazırdır**: müşteri menüsünden gönderilen istekler
(garson çağır, hesap, su, peçete, çatal-bıçak) panelde **Müşteri İstekleri**
sayfasında canlı olarak görünür ve personel "hallettim" ile kapatabilir.
