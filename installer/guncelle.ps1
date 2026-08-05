<#
.SYNOPSIS
    Var olan (USB'den offline kurulmuş) bir Restoran Otomasyonu kurulumunu
    yeni bir sürümle GÜNCELLER (yeniden kurulum yapmadan).
    (Docker YOK — SQL Server Express + Windows Servisi mimarisi.)

.DESCRIPTION
    scripts\paketle-guncelle.ps1 ile hazırlanan Guncelleme\ paketinin içeriği
    (yeni kaynak dosyalar + migrations\) bu script ile AYNI klasöre (kurulumun
    yapıldığı yer, ör. C:\RestoranOtomasyonu) kopyalandıktan sonra çalıştırılır.
    Şunları yapar:
      1) Backend Windows Servisini DURDURUR (dosyalar node.exe tarafından
         kilitli olmasın diye).
      2) Yeni migration'ları uygular (node scripts\migrate.js).
      3) Servisi yeniden BAŞLATIR ve 4091'de yanıt verdiğini doğrular.

    VERİTABANINA DOKUNULMAZ: SQL Server Express servisi hiç durdurulmaz,
    RestoranDB olduğu gibi kalır — migration'lar zaten idempotenttir
    (hepsi IF NOT EXISTS korumalı, bkz. scripts\migrate.js).

    Başarısızlıkta ayrıntılı Türkçe hata basar ve non-zero exit code döner.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File guncelle.ps1
#>

[CmdletBinding()]
param(
    [string]$InstallDir = $PSScriptRoot,
    [string]$ServisAdi = 'RestoranBackend'
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

$kimlik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Basarisiz 'Bu script YÖNETİCİ olarak çalıştırılmalı (Windows Servisi durdurulup başlatılacak).'
}

# ---------- .env kontrolü ----------
$envYolu = Join-Path $InstallDir '.env'
if (-not (Test-Path $envYolu)) {
    Basarisiz ".env dosyası bulunamadı ($envYolu). Bu script'i kurulumun yapıldığı klasörde çalıştırdığınızdan emin olun."
}

if (-not (Test-Path (Join-Path $InstallDir 'server.js'))) {
    Basarisiz "server.js bulunamadı. Bu script kurulum klasöründe (ör. C:\RestoranOtomasyonu) çalıştırılmalı."
}

# ---------- node.exe ----------
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe -and (Test-Path "$env:ProgramFiles\nodejs\node.exe")) {
    $nodeExe = "$env:ProgramFiles\nodejs\node.exe"
}
if (-not $nodeExe) { Basarisiz 'node.exe bulunamadı. Node.js kurulu olmalı.' }

# ---------- 1) Servisi durdur ----------
Adim "Backend servisi ($ServisAdi) durduruluyor..."
$servis = Get-Service -Name $ServisAdi -ErrorAction SilentlyContinue
if (-not $servis) {
    Basarisiz "'$ServisAdi' Windows Servisi bulunamadı. Kurulum tamamlanmamış olabilir — installer\postinstall.ps1'i çalıştırın."
}
if ($servis.Status -ne 'Stopped') {
    Stop-Service -Name $ServisAdi -Force
    for ($i = 0; $i -lt 20; $i++) {
        if ((Get-Service -Name $ServisAdi).Status -eq 'Stopped') { break }
        Start-Sleep -Seconds 1
    }
}

# ---------- 2) Migration'ları uygula ----------
# SQL Server servisi hiç durdurulmadı; yine de yeni açılmış olma ihtimaline
# karşı birkaç kez denenir (migrate.js idempotent olduğu için güvenli).
Adim 'Veritabanı şeması güncelleniyor (node scripts\migrate.js)...'
$migrateTamam = $false
for ($i = 0; $i -lt 5; $i++) {
    & $nodeExe (Join-Path $InstallDir 'scripts\migrate.js')
    if ($LASTEXITCODE -eq 0) { $migrateTamam = $true; break }
    Write-Host "Migration başarısız, tekrar deneniyor... ($($i + 1)/5)" -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}
if (-not $migrateTamam) {
    # Servisi geri başlat ki sistem güncellemesiz de olsa AYAKTA kalsın.
    Start-Service -Name $ServisAdi -ErrorAction SilentlyContinue
    Basarisiz @"
Migration'lar uygulanamadı. Backend servisi eski şemayla yeniden başlatıldı.

Elle denemek için:
  cd "$InstallDir"
  node scripts\migrate.js
"@
}

# ---------- 3) Servisi başlat ve doğrula ----------
Adim 'Backend servisi yeniden başlatılıyor...'
Start-Service -Name $ServisAdi

$yanitVerdi = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:4091/' -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $yanitVerdi = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}
if (-not $yanitVerdi) {
    Basarisiz @"
Servis başlatıldı ama http://localhost:4091 yanıt vermiyor.

Log dosyalarına bakın:
  $InstallDir\logs\servis-hata.log
  $InstallDir\logs\servis-cikti.log
"@
}

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host ' Güncelleme tamamlandı! Backend: http://localhost:4091/api' -ForegroundColor Green
Write-Host ' (Masaüstü panelini kapatıp yeniden açın.)' -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
exit 0
