<#
.SYNOPSIS
    Restoran Otomasyonu'nu offline (USB'den, internetsiz) kurulum için paketler.
    (Docker YOK — SQL Server Express + Windows Servisi mimarisi.)

.DESCRIPTION
    Evde/ofiste, İNTERNET BAĞLANTISI OLAN bir geliştirici makinesinde BİR KEZ
    çalıştırılır. Şunları yapar:
      1) Backend üretim bağımlılıklarını kurar (npm ci --omit=dev) — hedef
         makinede internet olmayabileceği için node_modules HAZIR gider.
      2) Müşteri QR menüsünü derler (musteri-menu: npm ci + npm run build).
         Backend bu dist'i statik olarak servis eder (bkz. server.js).
      3) KurulumPaketi\ klasörünü hazırlar ve içine README yazar.

    ARTIK YAPILMAYANLAR (Docker'dan çıkıldı):
      - docker compose build / docker save / images.tar
      - Docker Desktop Installer.exe

    restoran-panel BU PAKETE GİRMEZ: Tauri ile ayrı bir masaüstü .exe olarak
    paketlenip dağıtılıyor (npm run masaustu:derle). Backend adresi
    (http://localhost:4091) o exe'nin İÇİNE build anında gömülü olduğu için
    backend'in portu ASLA değiştirilmemelidir.

    Bu script'in İNDİRMEDİĞİ, kullanıcının KENDİSİNİN KurulumPaketi\ klasörüne
    koyması gereken dosyalar (script sonunda hatırlatılır):
      - SQLEXPR_x64_ENU.exe   (SQL Server Express tam/offline paketi)
      - nssm.exe              (https://nssm.cc/download > win64) -> installer\ klasörüne
      - node.exe              (src-tauri\binaries\node-*.exe kopyası) -> installer\ klasörüne
    Not: Node.js MSI'ına gerek yok; taşınabilir node.exe kurulum programının
    içine gömülür.

    KurulumPaketi\ hazır olduktan sonra installer\RestoranKurulum.iss Inno Setup
    ile derlenir; çıktı da OutputDir gereği aynı klasöre düşer. O klasörün
    TAMAMI USB'ye kopyalanır.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\paketle.ps1
#>

[CmdletBinding()]
param(
    # KurulumPaketi klasörünün oluşturulacağı yer (varsayılan: proje kökü).
    [string]$CikisKlasoru
)

$ScriptKlasoru = $PSScriptRoot
if (-not $ScriptKlasoru) {
    $ScriptKlasoru = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$kokDizin = Split-Path -Parent $ScriptKlasoru
if (-not $CikisKlasoru) {
    $CikisKlasoru = Join-Path $kokDizin 'KurulumPaketi'
}

$ErrorActionPreference = 'Stop'

function Adim($mesaj) {
    Write-Host ''
    Write-Host "==> $mesaj" -ForegroundColor Cyan
}

function Basarisiz($mesaj) {
    Write-Host "HATA: $mesaj" -ForegroundColor Red
    exit 1
}

# ---------- 0) Ön kontroller ----------
Adim 'Node.js kontrol ediliyor...'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Basarisiz 'Node.js bulunamadı. Paketleme makinesinde Node.js (LTS) kurulu olmalı.'
}
Write-Host "node $(node --version)"

Set-Location $kokDizin

# ---------- 1) Backend üretim bağımlılıkları ----------
# --omit=dev: jest/nodemon/sharp/tauri-cli gibi geliştirme paketleri hedef
# makinede gereksiz (ve sharp/tauri yüzlerce MB tutuyor).
Adim 'Backend üretim bağımlılıkları kuruluyor (npm ci --omit=dev)...'
npm ci --omit=dev
if ($LASTEXITCODE -ne 0) { Basarisiz 'npm ci --omit=dev başarısız oldu.' }

# ---------- 2) Müşteri menüsünü derle ----------
Adim 'Müşteri QR menüsü derleniyor (musteri-menu)...'
$menuKlasoru = Join-Path $kokDizin 'musteri-menu'
if (-not (Test-Path (Join-Path $menuKlasoru 'package.json'))) {
    Basarisiz "musteri-menu klasörü bulunamadı ($menuKlasoru)."
}
Push-Location $menuKlasoru
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'musteri-menu npm ci başarısız.' }
    # VITE_API_URL BİLEREK BOŞ: menü API'yi GÖRELİ '/api' adresinden çağırır.
    # Backend menüyü kendisi servis ettiği için bu adres her zaman doğru
    # sunucuyu gösterir — menü hangi IP/alan adından açılırsa açılsın.
    # (bkz. musteri-menu/src/api/client.js)
    $env:VITE_API_URL = ''
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'musteri-menu npm run build başarısız.' }
} catch {
    Pop-Location
    Basarisiz $_.Exception.Message
}
Pop-Location

if (-not (Test-Path (Join-Path $menuKlasoru 'dist\index.html'))) {
    Basarisiz 'musteri-menu\dist\index.html üretilmedi.'
}

# ---------- 3) Çıkış klasörünü hazırla ----------
#
# KLASÖR SİLİNMEZ (bilerek): içinde elle indirilmiş ÇOK BÜYÜK dosyalar olur —
# SQLEXPR_x64_ENU.exe (~700 MB) ve RESTO POS masaüstü paketleri. Script'i
# ikinci kez çalıştırmak bunları silseydi her seferinde yeniden indirilmeleri
# gerekirdi. Yalnızca bu script'in ÜRETTİĞİ dosyalar tazelenir; gerisi durur.
Adim "Çıkış klasörü hazırlanıyor: $CikisKlasoru"
New-Item -ItemType Directory -Force -Path $CikisKlasoru | Out-Null

$eskiSihirbaz = Join-Path $CikisKlasoru 'RestoranKurulumSihirbazi.exe'
if (Test-Path $eskiSihirbaz) { Remove-Item $eskiSihirbaz -Force }

# Docker döneminden kalan artıklar (eski bir paket üzerine çalışılıyorsa)
foreach ($artik in @('images.tar', 'docker-compose.yml', 'Docker Desktop Installer.exe')) {
    $yol = Join-Path $CikisKlasoru $artik
    if (Test-Path $yol) {
        Remove-Item $yol -Recurse -Force
        Write-Host "  temizlendi (Docker artığı): $artik"
    }
}
foreach ($eskiKlasor in @('migrations', 'scripts')) {
    $yol = Join-Path $CikisKlasoru $eskiKlasor
    if (Test-Path $yol) {
        Remove-Item $yol -Recurse -Force
        Write-Host "  temizlendi (artık sihirbaza gömülü): $eskiKlasor\"
    }
}

# Proje dosyalarının KOPYALANMASINA GEREK YOK: installer\RestoranKurulum.iss
# hepsini (server.js, config\, controllers\, routes\, utils\, migrations\,
# scripts\, node_modules\, musteri-menu\dist\) doğrudan repodan GÖMÜYOR.
# Bu klasöre sadece Inno Setup çıktısı ve SQL Express kurulumu konur.

# ---------- 3b) Taşınabilir Node'u installer\ klasörüne yerleştir ----------
# Kurulum programı bunu {app}\node.exe olarak açar ve servis DOĞRUDAN onu
# çalıştırır — hedef makinede Node.js kurulu olmasına gerek kalmaz.
# Kaynak, Tauri paketlemesinin ürettiği sidecar'dır; yoksa uyarılır.
Adim 'Taşınabilir Node.js hazırlanıyor...'
$sidecar = Get-ChildItem (Join-Path $kokDizin 'src-tauri\binaries') -Filter 'node-*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($sidecar) {
    Copy-Item $sidecar.FullName (Join-Path $kokDizin 'installer\node.exe') -Force
    Write-Host "  ✓ installer\node.exe ($([math]::Round($sidecar.Length/1MB,1)) MB)"
} elseif (Test-Path (Join-Path $kokDizin 'installer\node.exe')) {
    Write-Host '  ✓ installer\node.exe zaten mevcut'
} else {
    Write-Host '  ! installer\node.exe YOK — kurulum hedef makinede Node.js arayacak.' -ForegroundColor Yellow
    Write-Host '    Üretmek için: npm run masaustu:derle (sidecar''ı indirir)' -ForegroundColor Yellow
}

# ---------- 3c) Kurulum sihirbazını DERLE ----------
# Derleme BU SCRIPT'İN İÇİNDE yapılır çünkü sıralama kritiktir: yukarıdaki
# 'npm ci --omit=dev' node_modules'ü küçültür, ama sonra biri 'npm install'
# çalıştırırsa geliştirme paketleri geri gelir. Derleme elle/sonradan
# yapılırsa şişmiş bir node_modules (jest, vite, caniuse-lite...) sihirbazın
# içine gömülür — sessiz ve fark edilmesi zor bir hata. Burada, küçültmenin
# hemen ardından derleyerek bu ihtimali kapatıyoruz.
$iscc = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { $iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source }

if ($iscc) {
    Adim 'Kurulum sihirbazı derleniyor (Inno Setup)... birkaç dakika sürebilir.'
    & $iscc (Join-Path $kokDizin 'installer\RestoranKurulum.iss') | Out-Null
    if ($LASTEXITCODE -ne 0) { Basarisiz 'Inno Setup derlemesi başarısız oldu.' }
    Write-Host '  ✓ RestoranKurulumSihirbazi.exe'
} else {
    Write-Host '  ! Inno Setup (ISCC.exe) bulunamadı — sihirbaz DERLENMEDİ.' -ForegroundColor Yellow
    Write-Host '    https://jrsoftware.org/isinfo.php adresinden kurup şunu çalıştırın:' -ForegroundColor Yellow
    Write-Host '    ISCC.exe installer\RestoranKurulum.iss' -ForegroundColor Yellow
}

# OKUBENI.txt — KURAN kişi için (geliştirici için değil). Bilerek ASCII
# yazılmıştır: Not Defteri'nde kodlama sorunu çıkmasın diye.
$okuBeni = @"
===============================================================
 RESTORAN OTOMASYONU - KURULUM PAKETI
===============================================================

KURULUM SIRASI - onemli, once sunucu sonra panel:

ADIM 1 - Sunucu ve veritabani
  RestoranKurulumSihirbazi.exe   (sag tik > Yonetici olarak calistir)
  Sorulacaklar:
    - Veritabani sifresi (otomatik uretilir) -> MUTLAKA NOT ALIN
    - Ilk yonetici: Ad Soyad, kullanici adi, 4-6 haneli PIN
  SQL Server Express kurulumu birkac dakika surer ve ekranda ilerleme
  GOSTERMEZ. Takilmis gibi gorunse de bekleyin.

  NOT: Ayni klasorde SQLEXPR_x64_ENU.exe bulunmalidir.

ADIM 2 - Yonetim paneli
  "RESTO POS ... -setup.exe"  (ya da .msi - IKISINDEN BIRI, ikisi birden degil)
  Masaustunde "RESTO POS" kisayolu olusur.

ADIM 3 - QR menu adresini ayarlayin
  Sunucu bilgisayarinda komut istemi:  ipconfig
  "IPv4 Address" satirini not alin (orn. 192.168.1.50)
  Panelde: Ayarlar > Genel > "Musteri QR Menusu . Adres"
      http://192.168.1.50:4091
  localhost YAZMAYIN - musterinin telefonu acamaz.
  Adresi girdikten sonra masa QR kodlarini YENIDEN YAZDIRIN.

---------------------------------------------------------------
 KURULUMDAN SONRA
---------------------------------------------------------------

  Panel          : Masaustundeki RESTO POS uygulamasi
  Musteri menusu : http://<sunucu-ip>:4091/<masa-qr-kodu>
  API            : http://localhost:4091/api
  Veritabani     : localhost\SQLEXPRESS
  Kurulum klasoru: C:\RestoranOtomasyonu   (SILMEYIN)

Calistigini dogrulamak icin (Yonetici PowerShell):
  Get-Service RestoranBackend        -> Running olmali
  Get-Service 'MSSQL`$SQLEXPRESS'     -> Running olmali

Loglar:
  C:\RestoranOtomasyonu\logs\servis-hata.log
  C:\RestoranOtomasyonu\logs\servis-cikti.log

Kurulum yarida kalirsa bastan kurmaya gerek YOK, su komut tekrar
calistirilabilir (Yonetici PowerShell):
  powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\postinstall.ps1"

---------------------------------------------------------------
 NOTLAR
---------------------------------------------------------------

- Docker ARTIK KULLANILMIYOR. Sanallastirma / BIOS ayari gerekmez.
- Node.js kurmaniza GEREK YOK - kurulum kendi node.exe'sini tasir.
- Backend bir Windows Servisi olarak calisir, bilgisayar acilisinda
  kendiliginden baslar. Panel kapaliyken de mutfak ekrani ve QR menu calisir.
- Panel (RESTO POS) kendi icinde bir backend kopyasi tasir. Acilista 4091
  portuna bakar; servis calisiyorsa kendi kopyasini BASLATMAZ. Kurulum
  sirasi bu yuzden onemli.
- 4091 portunu oldugu gibi internete ACMAYIN: yonetim API'si de ayni
  porttadir.
- .sig dosyalari guncelleme imzalaridir, kurulumda kullanilmaz.

Ayrintili anlatim ve sorun giderme: projedeki BENIOKU.md
"@
Set-Content -Path (Join-Path $CikisKlasoru 'OKUBENI.txt') -Value $okuBeni -Encoding utf8

# ---------- 4) Özet ----------
$menuBoyutMB = [math]::Round(((Get-ChildItem (Join-Path $menuKlasoru 'dist') -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
$nmBoyutMB = [math]::Round(((Get-ChildItem (Join-Path $kokDizin 'node_modules') -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB), 1)

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host " Paketlemeye hazır." -ForegroundColor Green
Write-Host " musteri-menu\dist : $menuBoyutMB MB" -ForegroundColor Green
Write-Host " node_modules      : $nmBoyutMB MB (kurulum programına gömülecek)" -ForegroundColor Green
Write-Host " Çıkış klasörü     : $CikisKlasoru" -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
Write-Host ''
Write-Host 'SONRAKİ ADIMLAR:' -ForegroundColor Yellow
Write-Host " 1) nssm.exe'yi (https://nssm.cc/download > win64) şuraya kopyala:"
Write-Host "    $kokDizin\installer\nssm.exe"
Write-Host " 1b) Taşınabilir Node'u şuraya kopyala (Node.js MSI'ına gerek yok):"
Write-Host "    copy src-tauri\binaries\node-*.exe  installer\node.exe"
Write-Host " 2) SQLEXPR_x64_ENU.exe dosyasını şuraya kopyala:"
Write-Host "    $CikisKlasoru"
Write-Host ' 3) installer\RestoranKurulum.iss dosyasını Inno Setup ile derle (Compile).'
Write-Host "    Derlenen kurulum programı otomatik olarak $CikisKlasoru içine düşecek."
Write-Host " 4) $CikisKlasoru klasörünün TAMAMINI USB belleğe kopyala."
Write-Host ''
Write-Host 'AYRINTI: KurulumPaketi\OKUBENI.txt' -ForegroundColor Yellow
Write-Host ''
Write-Host 'UYARI: npm ci --omit=dev çalıştığı için geliştirme paketleri (jest, tauri)' -ForegroundColor Yellow
Write-Host 'artık kurulu değil. Geliştirmeye dönmek için: npm install' -ForegroundColor Yellow
Write-Host ''
