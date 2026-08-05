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
Adim "Çıkış klasörü hazırlanıyor: $CikisKlasoru"
if (Test-Path $CikisKlasoru) {
    Remove-Item $CikisKlasoru -Recurse -Force
}
New-Item -ItemType Directory -Path $CikisKlasoru | Out-Null

# Proje dosyalarının KOPYALANMASINA GEREK YOK: installer\RestoranKurulum.iss
# hepsini (server.js, config\, controllers\, routes\, utils\, migrations\,
# scripts\, node_modules\, musteri-menu\dist\) doğrudan repodan GÖMÜYOR.
# Bu klasöre sadece Inno Setup çıktısı ve büyük ikili dosyalar (SQL Express
# kurulumu, Node.js MSI) konur.

$okuBeni = @"
RESTORAN OTOMASYONU - KURULUM PAKETİ
====================================

Bu klasöre KOPYALANMASI GEREKEN dosyalar (büyük oldukları için repoda
tutulmuyor, buraya elle indirilir):

1) SQLEXPR_x64_ENU.exe   -- ZORUNLU
   SQL Server 2022 Express > Download Media > Express Core
   (Microsoft'un indirme sayfasından. Küçük indirici SQL2022-SSEI-Expr.exe
   de çalışır ama İNTERNET İSTER — USB kurulumu için TAM paketi kullanın.)

2) installer\node.exe    -- ZORUNLU (bu klasore DEGIL, kaynak klasore)
   src-tauri\binaries\node-*.exe dosyasinin kopyasi (~88 MB).
   Kurulum programinin ICINE gomulur; Node.js MSI'ina gerek yoktur.

3) RestoranKurulumSihirbazi.exe
   installer\RestoranKurulum.iss dosyasını Inno Setup ile derleyin (Compile);
   çıktı otomatik olarak bu klasöre düşer.

AYRICA (repo tarafında, derlemeden ÖNCE):
   installer\nssm.exe  -- https://nssm.cc/download > win64\nssm.exe
   Bu dosya kurulum programının İÇİNE gömülür.

Sonra bu klasörün TAMAMINI USB belleğe kopyalayın.

NOT: Yönetim paneli (RESTO POS) bu pakette DEĞİLDİR — Tauri ile ayrı bir
masaüstü .exe olarak derlenip (npm run masaustu:derle) ayrıca dağıtılır.
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
