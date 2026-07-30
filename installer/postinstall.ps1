<#
.SYNOPSIS
    Restoran Otomasyonu kurulum sonrası script'i.

.DESCRIPTION
    installer\RestoranKurulum.iss tarafından, dosyalar {app} klasörüne
    (varsayılan C:\RestoranOtomasyonu) kopyalandıktan ve sihirbazda toplanan
    bilgilerle {app}\.env yazıldıktan HEMEN SONRA çalıştırılır. .env'i (DB
    şifresi + ilk admin bilgileri) OKUYARAK çalışır — hassas değerler
    komut satırı argümanı olarak GEÇİRİLMEZ (tırnak/özel karakter kaçış
    sorunlarından kaçınmak için).

    Adımlar:
      1) Docker Desktop motorunun çalıştığından emin ol (gerekirse başlat).
      2) docker load -i images.tar  (paketle.ps1'in ürettiği offline imajlar)
      3) docker compose up -d       (--build YOK — imajlar zaten yüklü, offline)
      4) SQL Server hazır olana kadar bekle (retry, ~60sn)
      5) Veritabanını oluştur (CREATE DATABASE IF NOT EXISTS)
      6) docker compose run --rm backend npm run migrate
      7) docker compose exec backend node scripts/createFirstAdmin.js ...

    Başarısızlıkta ayrıntılı Türkçe hata basar ve non-zero exit code döner —
    installer\RestoranKurulum.iss bunu okuyup kullanıcıya gösterir.
#>

[CmdletBinding()]
param(
    [string]$InstallDir = $PSScriptRoot
)

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
$adminAd = $env_['INSTALLER_ADMIN_FULLNAME']
$adminKullanici = $env_['INSTALLER_ADMIN_USERNAME']
$adminPin = $env_['INSTALLER_ADMIN_PIN']

if (-not $dbSifre) { Basarisiz '.env içinde DB_PASSWORD bulunamadı.' }
if (-not $adminAd -or -not $adminKullanici -or -not $adminPin) {
    Basarisiz '.env içinde ilk admin bilgileri (INSTALLER_ADMIN_*) bulunamadı.'
}

# ---------- 1) Docker motorunun çalıştığından emin ol ----------
Adim 'Docker Desktop kontrol ediliyor...'
$dockerHazir = $false
for ($i = 0; $i -lt 3; $i++) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { $dockerHazir = $true; break }

    if ($i -eq 0) {
        $dockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
        if (Test-Path $dockerExe) {
            Write-Host 'Docker Desktop çalışmıyor, başlatılıyor (ilk açılış biraz sürebilir)...'
            Start-Process $dockerExe | Out-Null
        }
    }
    Write-Host "Docker motoru bekleniyor... ($($i + 1)/3, 20 saniye)"
    Start-Sleep -Seconds 20
}
if (-not $dockerHazir) {
    Basarisiz 'Docker Desktop çalışır duruma getirilemedi. Docker Desktop''u elle açıp (sistem tepsisindeki balina simgesi "Docker Desktop is running" demeli) bu kurulumu tekrar çalıştırın.'
}

# ---------- 2) Offline imajları yükle ----------
$tarYolu = Join-Path $InstallDir 'images.tar'
if (-not (Test-Path $tarYolu)) {
    Basarisiz "images.tar bulunamadı ($tarYolu). USB'deki KurulumPaketi klasörünün eksiksiz kopyalandığından emin olun."
}
Adim 'Offline Docker imajları yükleniyor (docker load)... bu birkaç dakika sürebilir.'
docker load -i $tarYolu
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker load başarısız oldu.' }

# ---------- 3) Servisleri ayağa kaldır (offline — yüklenen imajlar kullanılır) ----------
Adim 'Servisler başlatılıyor (docker compose up -d)...'
docker compose up -d
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker compose up -d başarısız oldu.' }

# ---------- 4) SQL Server hazır olana kadar bekle ----------
Adim 'Veritabanı sunucusunun hazır olması bekleniyor (en fazla ~60 sn)...'
$sqlHazir = $false
for ($i = 0; $i -lt 20; $i++) {
    docker compose exec -T db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $dbSifre -C -Q "SELECT 1" *> $null
    if ($LASTEXITCODE -eq 0) { $sqlHazir = $true; break }
    Start-Sleep -Seconds 3
}
if (-not $sqlHazir) {
    Basarisiz 'Veritabanı sunucusu 60 saniye içinde hazır olmadı. "docker compose logs db" ile ayrıntıya bakabilirsiniz.'
}

# ---------- 5) Veritabanını oluştur ----------
Adim 'Veritabanı oluşturuluyor (RestoranDB)...'
docker compose exec -T db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $dbSifre -C `
    -Q "IF DB_ID('RestoranDB') IS NULL CREATE DATABASE RestoranDB"
if ($LASTEXITCODE -ne 0) { Basarisiz 'Veritabanı oluşturulamadı.' }

# ---------- 6) Migration'ları uygula ----------
Adim 'Veritabanı şeması uygulanıyor (migrate)...'
docker compose run --rm backend npm run migrate
if ($LASTEXITCODE -ne 0) { Basarisiz 'Migration''lar uygulanamadı.' }

# ---------- 7) İlk admin kullanıcısını oluştur ----------
Adim 'İlk admin kullanıcısı oluşturuluyor...'
docker compose exec -T backend node scripts/createFirstAdmin.js "$adminAd" "$adminKullanici" "$adminPin"
if ($LASTEXITCODE -ne 0) {
    Write-Host 'UYARI: İlk admin oluşturulamadı — muhtemelen bu kullanıcı adı zaten var (kurulum tekrar mı çalıştırıldı?). Panelden veya' -ForegroundColor Yellow
    Write-Host '"docker compose exec backend node scripts/createFirstAdmin.js ""Ad Soyad"" ""kullaniciadi"" ""1234""" komutuyla elle deneyebilirsiniz.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host ' Kurulum tamamlandı! Panel: http://localhost:8080' -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
exit 0
