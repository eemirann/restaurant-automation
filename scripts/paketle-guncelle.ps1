<#
.SYNOPSIS
    Var olan bir Restoran Otomasyonu kurulumunu GÜNCELLEMEK için küçük bir
    paket hazırlar (paketle.ps1'in aksine node_modules'ü ve SQL Express
    kurulum dosyasını içermez — çok daha küçük ve hızlı).

.DESCRIPTION
    Bu (internete bağlı, kod değişikliğinin yapıldığı) geliştirici
    makinesinde çalıştırılır. Guncelleme\ klasörüne şunları koyar:
      1) Değişen backend kaynak dosyaları (server.js, config\, controllers\,
         middleware\, routes\, utils\, scripts\)
      2) migrations\  (yeni migration eklenmiş olabilir; küçük olduğu için
         her zaman dahil edilir — migrate.js idempotent)
      3) musteri-menu\dist\  (istenirse yeniden derlenir)
      4) installer\guncelle.ps1

    node_modules DAHİL EDİLMEZ: bağımlılık değişmediyse hedef makinede zaten
    kurulu. package.json'daki bağımlılıklar değiştiyse -BagimliliklarDegisti
    ile node_modules'ü de pakete ekleyin.

    Çıkan Guncelleme\ klasörünün TAMAMI USB ile hedef bilgisayara taşınır;
    orada C:\RestoranOtomasyonu (kurulumun yapıldığı klasör) içine kopyalanıp
    guncelle.ps1 YÖNETİCİ olarak çalıştırılır.

    NOT: Yönetim paneli (RESTO POS / Tauri exe) bu paketin KAPSAMI DIŞINDA —
    ayrı derlenip ayrı dağıtılır.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1

.EXAMPLE
    # Müşteri menüsü de değiştiyse yeniden derle:
    powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1 -MenuyuDerle
#>

[CmdletBinding()]
param(
    # Çıkış klasörü (varsayılan: proje kökünde Guncelleme\).
    [string]$CikisKlasoru,

    # musteri-menu'yü yeniden derleyip pakete ekle.
    [switch]$MenuyuDerle,

    # package.json bağımlılıkları değiştiyse node_modules'ü de pakete ekle.
    [switch]$BagimliliklarDegisti
)

$ScriptKlasoru = $PSScriptRoot
if (-not $ScriptKlasoru) {
    $ScriptKlasoru = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$kokDizin = Split-Path -Parent $ScriptKlasoru
if (-not $CikisKlasoru) {
    $CikisKlasoru = Join-Path $kokDizin 'Guncelleme'
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

Set-Location $kokDizin

# ---------- 1) Çıkış klasörünü hazırla ----------
Adim "Çıkış klasörü hazırlanıyor: $CikisKlasoru"
if (Test-Path $CikisKlasoru) {
    Remove-Item $CikisKlasoru -Recurse -Force
}
New-Item -ItemType Directory -Path $CikisKlasoru | Out-Null

# ---------- 2) Müşteri menüsünü (istenirse) derle ----------
$menuKlasoru = Join-Path $kokDizin 'musteri-menu'
if ($MenuyuDerle) {
    Adim 'Müşteri QR menüsü derleniyor...'
    Push-Location $menuKlasoru
    try {
        if (-not (Test-Path (Join-Path $menuKlasoru 'node_modules'))) {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw 'musteri-menu npm ci başarısız.' }
        }
        # VITE_API_URL bilerek boş — menü API'yi göreli '/api' ile çağırır.
        $env:VITE_API_URL = ''
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'musteri-menu npm run build başarısız.' }
    } catch {
        Pop-Location
        Basarisiz $_.Exception.Message
    }
    Pop-Location
}

# ---------- 3) Dosyaları kopyala ----------
Adim 'Backend kaynak dosyaları kopyalanıyor...'

$klasorler = @('config', 'controllers', 'middleware', 'routes', 'utils', 'scripts', 'migrations')
foreach ($k in $klasorler) {
    $kaynak = Join-Path $kokDizin $k
    if (Test-Path $kaynak) {
        Copy-Item $kaynak (Join-Path $CikisKlasoru $k) -Recurse
    }
}
# paketle*.ps1 hedef makinede işe yaramaz — pakete girmesin.
Get-ChildItem (Join-Path $CikisKlasoru 'scripts') -Filter 'paketle*.ps1' -ErrorAction SilentlyContinue |
    Remove-Item -Force

foreach ($d in @('server.js', 'package.json', 'package-lock.json', '.env.example')) {
    $kaynak = Join-Path $kokDizin $d
    if (Test-Path $kaynak) { Copy-Item $kaynak $CikisKlasoru }
}

if (Test-Path (Join-Path $menuKlasoru 'dist\index.html')) {
    Adim 'Müşteri menüsü (musteri-menu\dist) kopyalanıyor...'
    New-Item -ItemType Directory -Force -Path (Join-Path $CikisKlasoru 'musteri-menu') | Out-Null
    Copy-Item (Join-Path $menuKlasoru 'dist') (Join-Path $CikisKlasoru 'musteri-menu\dist') -Recurse
} else {
    Write-Host 'UYARI: musteri-menu\dist bulunamadı — menü pakete eklenmedi (-MenuyuDerle ile derleyebilirsiniz).' -ForegroundColor Yellow
}

if ($BagimliliklarDegisti) {
    Adim 'node_modules kopyalanıyor (bağımlılıklar değişti)... bu biraz sürebilir.'
    if (-not (Test-Path (Join-Path $kokDizin 'node_modules'))) {
        Basarisiz 'node_modules bulunamadı. Önce: npm ci --omit=dev'
    }
    Copy-Item (Join-Path $kokDizin 'node_modules') (Join-Path $CikisKlasoru 'node_modules') -Recurse
}

Copy-Item (Join-Path $kokDizin 'installer\guncelle.ps1') $CikisKlasoru

# ---------- 4) Özet ----------
$boyutMB = [math]::Round(((Get-ChildItem $CikisKlasoru -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host " Güncelleme paketi hazır: $CikisKlasoru" -ForegroundColor Green
Write-Host " Toplam boyut: $boyutMB MB" -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
Write-Host ''
Write-Host 'SONRAKİ ADIMLAR:' -ForegroundColor Yellow
Write-Host " 1) $CikisKlasoru klasörünün TAMAMINI USB belleğe kopyala."
Write-Host ' 2) Hedef bilgisayarda, USB''deki bu klasörün İÇERİĞİNİ kurulum klasörüne'
Write-Host '    (ör. C:\RestoranOtomasyonu) kopyala — üzerine yazsın.'
Write-Host '    ÖNEMLİ: .env dosyası pakette YOK, üzerine yazılmaz (şifreler korunur).'
Write-Host ' 3) YÖNETİCİ olarak PowerShell aç, şunu çalıştır:'
Write-Host '    powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\guncelle.ps1"'
Write-Host ''
