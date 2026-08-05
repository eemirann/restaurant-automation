<#
.SYNOPSIS
    Restoran Otomasyonu kurulum sonrası script'i (SQL Server Express +
    Windows Servisi kurulumu — Docker YOK).

.DESCRIPTION
    installer\RestoranKurulum.iss tarafından, dosyalar {app} klasörüne
    (varsayılan C:\RestoranOtomasyonu) kopyalandıktan ve sihirbazda toplanan
    bilgilerle {app}\.env yazıldıktan HEMEN SONRA çalıştırılır. .env'i (DB
    şifresi + ilk admin bilgileri) OKUYARAK çalışır — hassas değerler
    komut satırı argümanı olarak GEÇİRİLMEZ (tırnak/özel karakter kaçış
    sorunlarından kaçınmak için).

    Adımlar:
      1) Node.js kurulu mu? (yoksa paketteki MSI ile sessiz kurar)
      2) SQL Server Express kurulumu + yapılandırma (kurulum-sql-express.ps1)
      3) Backend bağımlılıkları (npm ci --omit=dev, offline node_modules varsa atlanır)
      4) Müşteri menüsü derlemesi (musteri-menu: npm ci + npm run build)
      5) Şema: node scripts/migrate.js          (ESKİDEN: docker compose run --rm backend npm run migrate)
      6) İlk admin: node scripts/createFirstAdmin.js  (ESKİDEN: docker compose exec backend node ...)
      7) Backend'i Windows Servisi olarak kaydet (servis-kur.ps1, NSSM)

    KAPSAM DIŞI: restoran-panel. O, Tauri ile ayrı bir masaüstü .exe olarak
    paketlenip dağıtılıyor; dist'i exe'nin İÇİNE gömülü ve backend adresi
    (http://localhost:4091) BUILD ANINDA sabitlenmiş durumda. Bu yüzden
    burada ne derlenir ne servis edilir — ve backend'in portu 4091'den
    BAŞKA BİR ŞEY OLAMAZ, aksi halde var olan exe çalışmaz.

    Başarısızlıkta ayrıntılı Türkçe hata basar ve non-zero exit code döner —
    installer\RestoranKurulum.iss bunu okuyup kullanıcıya gösterir.
#>

[CmdletBinding()]
param(
    [string]$InstallDir = $PSScriptRoot
)

if (-not $InstallDir) {
    if ($MyInvocation.MyCommand.Path) {
        $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    } else {
        $InstallDir = (Get-Location).Path
    }
}

$ErrorActionPreference = 'Stop'
Set-Location $InstallDir

function Adim($mesaj) {
    Write-Host ''
    Write-Host "==> $mesaj" -ForegroundColor Cyan
}

function Basarisiz($mesaj) {
    Write-Host ''
    Write-Host "KURULUM HATASI: $mesaj" -ForegroundColor Red
    exit 1
}

# ---------- .env'i oku ----------
$envYolu = Join-Path $InstallDir '.env'
if (-not (Test-Path $envYolu)) {
    Basarisiz ".env dosyası bulunamadı ($envYolu). Sihirbaz bu dosyayı kurulum sırasında oluşturmalıydı."
}

$env_ = @{}
Get-Content $envYolu | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $parts = $_.Split('=', 2)
    $env_[$parts[0].Trim()] = $parts[1].Trim()
}

$dbSifre = $env_['DB_PASSWORD']
$dbSunucu = $env_['DB_SERVER']
$dbAdi = $env_['DB_DATABASE']
$adminAd = $env_['INSTALLER_ADMIN_FULLNAME']
$adminKullanici = $env_['INSTALLER_ADMIN_USERNAME']
$adminPin = $env_['INSTALLER_ADMIN_PIN']

if (-not $dbSifre) { Basarisiz '.env içinde DB_PASSWORD bulunamadı.' }
if (-not $adminAd -or -not $adminKullanici -or -not $adminPin) {
    Basarisiz '.env içinde ilk admin bilgileri (INSTALLER_ADMIN_*) bulunamadı.'
}
if (-not $dbAdi) { $dbAdi = 'RestoranDB' }

# DB_SERVER 'localhost\SQLEXPRESS' biçimindeyse instance adını ayıkla.
$instanceAdi = 'SQLEXPRESS'
if ($dbSunucu -and $dbSunucu.Contains('\')) {
    $instanceAdi = $dbSunucu.Split('\')[1]
}

$yedekKlasoru = $env_['BACKUP_FS_DIR']
if (-not $yedekKlasoru) { $yedekKlasoru = Join-Path $InstallDir 'db-backups' }

# ============================================================
# 1) Node.js
# ============================================================
Adim 'Node.js kontrol ediliyor...'
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
    foreach ($aday in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")) {
        if (Test-Path $aday) { $nodeExe = $aday; break }
    }
}

if (-not $nodeExe) {
    # Kurulum programıyla AYNI klasörde (USB'de sibling) Node.js MSI'ı ara.
    $msi = Get-ChildItem -Path $InstallDir, (Split-Path -Parent $InstallDir) -Filter 'node-v*-x64.msi' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $msi) {
        Basarisiz @'
Node.js kurulu değil ve kurulum paketinde Node.js MSI'ı bulunamadı.

https://nodejs.org adresinden LTS sürümünü (Windows Installer, 64-bit) indirip
kurun, ardından bu script'i tekrar çalıştırın:
  powershell -ExecutionPolicy Bypass -File "<kurulum klasörü>\postinstall.ps1"
'@
    }
    Write-Host "Node.js kuruluyor ($($msi.Name))..."
    $p = Start-Process msiexec.exe -ArgumentList "/i `"$($msi.FullName)`" /qn /norestart" -Wait -PassThru
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
        Basarisiz "Node.js kurulumu başarısız oldu (çıkış kodu: $($p.ExitCode))."
    }
    # PATH bu süreçte güncel değil — doğrudan bilinen yola bak.
    $nodeExe = "$env:ProgramFiles\nodejs\node.exe"
    if (-not (Test-Path $nodeExe)) { Basarisiz 'Node.js kuruldu ama node.exe bulunamadı.' }
    $env:Path = "$env:Path;$env:ProgramFiles\nodejs"
}
Write-Host "node.exe: $nodeExe"

$npmCmd = Join-Path (Split-Path -Parent $nodeExe) 'npm.cmd'
if (-not (Test-Path $npmCmd)) { Basarisiz "npm.cmd bulunamadı ($npmCmd)." }

# ============================================================
# 2) SQL Server Express
# ============================================================
Adim 'SQL Server Express kuruluyor / yapılandırılıyor...'
$sqlScript = Join-Path $InstallDir 'kurulum-sql-express.ps1'
if (-not (Test-Path $sqlScript)) { Basarisiz "kurulum-sql-express.ps1 bulunamadı ($sqlScript)." }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sqlScript `
    -SaSifre $dbSifre -InstanceAdi $instanceAdi -Veritabani $dbAdi -YedekKlasoru $yedekKlasoru
if ($LASTEXITCODE -ne 0) {
    Basarisiz 'SQL Server Express kurulumu/yapılandırması başarısız oldu (ayrıntı yukarıda).'
}

# ============================================================
# 3) Backend bağımlılıkları
#
# Offline kurulumda node_modules kurulum paketiyle HAZIR gelir (paketle.ps1
# kopyalar) — o zaman bu adım atlanır. İnternet varsa npm ci çalıştırılır.
# ============================================================
if (Test-Path (Join-Path $InstallDir 'node_modules\express')) {
    Adim 'Backend bağımlılıkları hazır (node_modules mevcut) — npm adımı atlanıyor.'
} else {
    Adim 'Backend bağımlılıkları kuruluyor (npm ci --omit=dev)... internet gerekir.'
    & $npmCmd ci --omit=dev
    if ($LASTEXITCODE -ne 0) {
        Basarisiz 'npm ci başarısız oldu. İnternet bağlantısı yoksa, node_modules klasörünü hazır olarak kurulum paketine ekleyin.'
    }
}

# ============================================================
# 4) Müşteri menüsü derlemesi
#
# Docker'da ayrı bir nginx konteyneri (customer-menu, :8081) servis ediyordu.
# Artık backend, musteri-menu/dist'i kendisi statik olarak servis ediyor
# (bkz. server.js) — bu yüzden dist'in var olması gerekiyor.
# restoran-panel BURADA DERLENMEZ: Tauri exe'si ayrı dağıtılıyor.
# ============================================================
$menuKlasoru = Join-Path $InstallDir 'musteri-menu'
$menuDist = Join-Path $menuKlasoru 'dist\index.html'

if (Test-Path $menuDist) {
    Adim 'Müşteri menüsü zaten derlenmiş (musteri-menu\dist) — derleme atlanıyor.'
} elseif (Test-Path (Join-Path $menuKlasoru 'package.json')) {
    Adim 'Müşteri menüsü derleniyor (musteri-menu)...'
    # Menü derlenemezse kurulum DURMAZ: backend ve panel bundan bağımsız
    # çalışır, sadece QR menüsü servis edilmez (sonradan derlenebilir).
    Push-Location $menuKlasoru
    try {
        if (-not (Test-Path (Join-Path $menuKlasoru 'node_modules'))) {
            & $npmCmd ci
            if ($LASTEXITCODE -ne 0) { throw 'musteri-menu npm ci başarısız (internet gerekir).' }
        }
        & $npmCmd run build
        if ($LASTEXITCODE -ne 0) { throw 'musteri-menu npm run build başarısız.' }
    } catch {
        Write-Host "UYARI: Müşteri menüsü derlenemedi: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host 'Backend ve panel normal çalışır; sadece QR menüsü servis edilmez.' -ForegroundColor Yellow
        Write-Host "Sonradan derlemek için: cd ""$menuKlasoru""; npm ci; npm run build" -ForegroundColor Yellow
    } finally {
        Pop-Location
    }
} else {
    Write-Host 'UYARI: musteri-menu klasörü yok — QR menüsü servis edilmeyecek.' -ForegroundColor Yellow
}

# ============================================================
# 5) Migration'ları uygula (DOĞRUDAN node ile — docker compose run YOK)
# ============================================================
Adim 'Veritabanı şeması uygulanıyor (node scripts\migrate.js)...'
& $nodeExe (Join-Path $InstallDir 'scripts\migrate.js')
if ($LASTEXITCODE -ne 0) {
    Basarisiz @"
Migration'lar uygulanamadı.

.env'deki bağlantı ayarlarını kontrol edip elle tekrar deneyebilirsiniz:
  cd "$InstallDir"
  node scripts\migrate.js
"@
}

# ============================================================
# 6) İlk admin kullanıcısı (DOĞRUDAN node ile — docker compose exec YOK)
# ============================================================
Adim 'İlk admin kullanıcısı oluşturuluyor...'
& $nodeExe (Join-Path $InstallDir 'scripts\createFirstAdmin.js') $adminAd $adminKullanici $adminPin
if ($LASTEXITCODE -ne 0) {
    Write-Host 'UYARI: İlk admin oluşturulamadı — muhtemelen bu kullanıcı adı zaten var (kurulum tekrar mı çalıştırıldı?).' -ForegroundColor Yellow
    Write-Host "Elle denemek için: node scripts\createFirstAdmin.js ""Ad Soyad"" ""kullaniciadi"" ""1234""" -ForegroundColor Yellow
}

# ============================================================
# 7) Backend'i Windows Servisi yap (NSSM)
# ============================================================
Adim 'Backend Windows Servisi olarak kaydediliyor (NSSM)...'
$servisScript = Join-Path $InstallDir 'servis-kur.ps1'
if (-not (Test-Path $servisScript)) { Basarisiz "servis-kur.ps1 bulunamadı ($servisScript)." }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $servisScript -UygulamaKlasoru $InstallDir
if ($LASTEXITCODE -ne 0) {
    Basarisiz 'Backend Windows Servisi kurulamadı / başlatılamadı (ayrıntı yukarıda).'
}

# ---------- Son doğrulama: /api gerçekten yanıt veriyor mu? ----------
# Tauri exe'si TAM OLARAK bu adrese bağlanıyor (build anında gömülü).
Adim 'API doğrulanıyor: http://localhost:4091/api ...'
$apiTamam = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        # Kimliksiz istek 401 döner — bu API'nin AYAKTA olduğunu kanıtlar.
        Invoke-WebRequest -Uri 'http://localhost:4091/api/products' -UseBasicParsing -TimeoutSec 3 | Out-Null
        $apiTamam = $true; break
    } catch {
        $kod = $_.Exception.Response.StatusCode.value__
        if ($kod -eq 401 -or $kod -eq 403 -or $kod -eq 404) { $apiTamam = $true; break }
    }
    Start-Sleep -Seconds 2
}
if (-not $apiTamam) {
    Basarisiz 'Servis çalışıyor ama http://localhost:4091/api yanıt vermiyor. logs\servis-hata.log dosyasına bakın.'
}

# ---------- Yerel IP (müşteri menüsü QR adresi için) ----------
$yerelIp = '<bu-bilgisayarin-ip-adresi>'
try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
        Select-Object -First 1
    if ($ip) { $yerelIp = $ip.IPAddress }
} catch {}

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host ' Kurulum tamamlandı!' -ForegroundColor Green
Write-Host ''
Write-Host ' Backend (Windows Servisi): http://localhost:4091/api' -ForegroundColor Green
Write-Host ' Panel: masaüstündeki "RESTO POS" uygulamasından açılır' -ForegroundColor Green
Write-Host " Müşteri QR menüsü: http://${yerelIp}:4091/<masa-qr-kodu>" -ForegroundColor Green
Write-Host ''
Write-Host ' ÖNEMLİ: Panelde Ayarlar > "Müşteri Menü Adresi" alanına şunu yazın:' -ForegroundColor Yellow
Write-Host "   http://${yerelIp}:4091" -ForegroundColor Yellow
Write-Host ' (Masa QR kodları bu adrese göre üretilir.)' -ForegroundColor Yellow
Write-Host '==================================================================' -ForegroundColor Green
exit 0
