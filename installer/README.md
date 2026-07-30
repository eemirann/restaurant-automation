# Offline (USB) Kurulum Paketi

Restoran Otomasyonu'nu internet bağlantısı olmayan bir kasa/POS bilgisayarına,
tek bir çift-tıklamalı Türkçe sihirbazla kurmak için.

## Nasıl çalışır (özet)

1. **Paketleme** — internete bağlı bir geliştirici makinesinde **bir kez**
   `scripts\paketle.ps1` çalıştırılır: Docker imajları derlenir/indirilir ve
   TEK bir `images.tar` dosyasına aktarılır, küçük proje dosyalarıyla
   (`migrations/`, `scripts/`, `docker-compose.yml`, `.env.example`) birlikte
   repo kökünde `KurulumPaketi\` klasöründe toplanır.
2. **Sihirbazı derleme** — [Inno Setup 6](https://jrsoftware.org/isinfo.php)
   ile `installer\RestoranKurulum.iss` derlenir (Inno Setup IDE'de aç →
   *Compile*, ya da `ISCC.exe installer\RestoranKurulum.iss`). Derlenen
   `RestoranKurulumSihirbazi.exe`, `OutputDir` ayarı gereği otomatik olarak
   `KurulumPaketi\` klasörüne düşer.
3. Kullanıcı, **[Docker Desktop Installer.exe](https://www.docker.com/products/docker-desktop)**'ı
   kendisi indirip `KurulumPaketi\` klasörüne kopyalar (bu script tarafından
   indirilmez — lisans/güncel sürüm nedeniyle kasıtlı olarak elle eklenir).
4. `KurulumPaketi\` klasörünün **tamamı** USB belleğe kopyalanır. Hedef
   bilgisayarda `RestoranKurulumSihirbazi.exe` çift tıklanır.

## Sihirbaz hedef bilgisayarda ne yapar

- Docker Desktop kurulu değilse, aynı klasördeki `Docker Desktop
  Installer.exe`'yi başlatmayı teklif eder (BIOS/sanallaştırma sorunlarını
  OTOMATİK ÇÖZEMEZ — kullanıcıya Türkçe bir yönlendirme mesajı gösterir).
- Veritabanı şifresi (otomatik güçlü şifre önerilir) ve ilk yönetici
  (Ad Soyad / kullanıcı adı / PIN) bilgilerini sorar.
- Dosyaları `C:\RestoranOtomasyonu`'na kopyalar, `.env`'i oluşturur.
- `installer\postinstall.ps1`'i çalıştırır: `docker load` (offline imajlar) →
  `docker compose up -d` → veritabanı hazır olana kadar bekler → veritabanını
  oluşturur → migration'ları uygular → ilk admin kullanıcısını oluşturur.
- Masaüstüne, Chrome/Edge'i `--app=http://localhost:8080` ile açan (native
  app hissi veren) bir kısayol bırakır.

## Önemli mimari not

`docker-compose.yml`'deki üst seviye `name: restoran-otomasyonu` alanı
BİLEREK SABİT tutulur — paketleme makinesindeki klasör adı ile hedef
makinedeki `C:\RestoranOtomasyonu` FARKLI olduğu için, imaj etiketleri proje
adına göre otomatik türetilseydi (`<klasör-adı>-backend` vb.) `docker compose
up -d` yüklenen offline imajları bulamaz, kurulum bozulurdu.

## Test etme

Bu sihirbaz **gerçek bir Windows makinesinde** uçtan uca test edilmelidir.
`installer\RestoranKurulum.iss`, Inno Setup ile hatasız derleniyor olması
sözdiziminin doğru olduğunu gösterir, ama gerçek bir kurulumu (Docker
Desktop kurulumu, `docker compose up`, veritabanı bağlantısı, panele giriş)
YERİNE GEÇMEZ — bunlar temiz/sanal bir Windows ortamında elle doğrulanmalıdır.
