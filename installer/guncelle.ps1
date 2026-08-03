<#
.SYNOPSIS
    Var olan (USB'den offline kurulmuş) bir Restoran Otomasyonu kurulumunu
    yeni bir sürümle GÜNCELLER (yeniden kurulum yapmadan).

.DESCRIPTION
    scripts\paketle-guncelle.ps1 ile hazırlanan Guncelleme\ paketinin
    içeriği (guncelleme.tar + migrations\) bu script ile AYNI klasöre
    (kurulumun yapıldığı yer, ör. C:\RestoranOtomasyonu) kopyalandıktan
    sonra çalıştırılır. Şunları yapar:
      1) guncelleme.tar'daki yeni imajları yükler (docker load).
      2) Değişen servisleri yeni imajlarla yeniden oluşturur
         (docker compose up -d --force-recreate) — veritabanı (db)
         servisine DOKUNMAZ, verileriniz etkilenmez.
      3) Varsa yeni migration'ları uygular.

    Başarısızlıkta ayrıntılı Türkçe hata basar ve non-zero exit code döner.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File guncelle.ps1
#>

[CmdletBinding()]
param(
    [string]$InstallDir = $PSScriptRoot,

    # Yeniden oluşturulacak servisler (db HARİÇ — veritabanı container'ına dokunulmaz).
    [string[]]$Servisler = @('backend', 'panel', 'customer-menu')
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
    Write-Host "GÜNCELLEME HATASI: $mesaj" -ForegroundColor Red
    exit 1
}

# ---------- .env'i oku (DB_PASSWORD, SQL hazır-mı kontrolü için gerekli) ----------
$envYolu = Join-Path $InstallDir '.env'
if (-not (Test-Path $envYolu)) {
    Basarisiz ".env dosyası bulunamadı ($envYolu). Bu script'i kurulumun yapıldığı klasörde çalıştırdığınızdan emin olun."
}

$env_ = @{}
Get-Content $envYolu | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
    $parts = $_.Split('=', 2)
    $env_[$parts[0].Trim()] = $parts[1].Trim()
}
$dbSifre = $env_['DB_PASSWORD']
if (-not $dbSifre) { Basarisiz '.env içinde DB_PASSWORD bulunamadı.' }

# ---------- 1) Docker Desktop kontrolü ----------
Adim 'Docker Desktop kontrol ediliyor...'
$dockerHazir = $false
for ($i = 0; $i -lt 3; $i++) {
    try {
        docker info *> $null
    } catch {}
    if ($LASTEXITCODE -eq 0) { $dockerHazir = $true; break }
    Write-Host "Docker motoru bekleniyor... ($($i + 1)/3, 20 saniye)"
    Start-Sleep -Seconds 20
}
if (-not $dockerHazir) {
    Basarisiz 'Docker Desktop çalışır durumda değil. Docker Desktop''u elle açıp bu güncellemeyi tekrar çalıştırın.'
}

# ---------- 2) Yeni imajları yükle ----------
$tarYolu = Join-Path $InstallDir 'guncelleme.tar'
if (-not (Test-Path $tarYolu)) {
    Basarisiz "guncelleme.tar bulunamadı ($tarYolu). USB'deki Guncelleme paketinin içeriğinin bu klasöre kopyalandığından emin olun."
}
Adim 'Yeni imajlar yükleniyor (docker load)...'
docker load -i $tarYolu
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker load başarısız oldu.' }

# ---------- 3) Değişen servisleri yeni imajla yeniden oluştur (db HARİÇ) ----------
Adim "Servisler yeniden oluşturuluyor (docker compose up -d --force-recreate $($Servisler -join ' '))..."
docker compose up -d --force-recreate @Servisler
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker compose up -d --force-recreate başarısız oldu.' }

# ---------- 4) SQL Server'ın hazır olmasını bekle (en fazla ~60 sn) ----------
# db servisine dokunmadık ama SQL Server henüz tam açılış aşamasında olabilir
# (ör. bu güncellemeden hemen önce başlatılmışsa) — migrate'in erken denenip
# başarısız olmasını önlemek için.
Adim 'Veritabanı sunucusunun hazır olması bekleniyor (en fazla ~60 sn)...'
$sqlHazir = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        docker compose exec -T db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P $dbSifre -C -Q "SELECT 1" *> $null
    } catch {}
    if ($LASTEXITCODE -eq 0) { $sqlHazir = $true; break }
    Start-Sleep -Seconds 3
}
if (-not $sqlHazir) {
    Basarisiz 'Veritabanı sunucusu 60 saniye içinde hazır olmadı. "docker compose logs db" ile ayrıntıya bakabilirsiniz.'
}

# ---------- 5) Yeni migration'ları uygula ----------
Adim 'Veritabanı şeması güncelleniyor (migrate)...'
docker compose run --rm backend npm run migrate
if ($LASTEXITCODE -ne 0) { Basarisiz 'Migration''lar uygulanamadı.' }

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host ' Güncelleme tamamlandı! Panel: http://localhost:8080' -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
exit 0
