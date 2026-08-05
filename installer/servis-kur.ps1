<#
.SYNOPSIS
    Backend'i (node server.js) NSSM ile bir Windows Servisi olarak kaydeder.

.DESCRIPTION
    Docker'daki "backend" servisinin (restart: unless-stopped) yerini alır.
    Windows Servisi olması şart, çünkü:
      - Restoran bilgisayarı açıldığında KİMSE GİRİŞ YAPMADAN backend ayağa
        kalkmalı (Tauri paneli açıldığında localhost:4091'i hazır bulmalı).
      - Süreç çökerse otomatik yeniden başlamalı.
      - Konsol penceresi görünmemeli.

    NSSM (Non-Sucking Service Manager) kullanılır: node.exe'yi doğrudan
    servis olarak kaydetmek mümkün değildir (Windows servis API'sini
    konuşmaz), NSSM bu sarmalayıcıyı sağlar ve stdout/stderr'i dosyaya
    yönlendirir.

    !!! PORT 4091 SABİTTİR !!!
    restoran-panel Tauri exe'sinin içine http://localhost:4091 adresi BUILD
    ANINDA gömülüdür. Bu servisin dinlediği port değiştirilirse var olan
    masaüstü exe'si backend'i bulamaz ve YENİDEN DERLENMESİ gerekir.

    TEKRAR ÇALIŞTIRILABİLİR: servis zaten varsa durdurulur, ayarları
    güncellenir ve yeniden başlatılır.

.PARAMETER UygulamaKlasoru
    server.js'in bulunduğu klasör (ör. C:\RestoranOtomasyonu).

.PARAMETER ServisAdi
    Varsayılan: RestoranBackend

.PARAMETER NssmYolu
    nssm.exe yolu. Verilmezse script klasöründe / PATH'te aranır.
#>

[CmdletBinding()]
param(
    [string]$UygulamaKlasoru = (Split-Path -Parent $PSScriptRoot),
    [string]$ServisAdi = 'RestoranBackend',
    [string]$NssmYolu = ''
)

$ErrorActionPreference = 'Stop'

function Adim($mesaj) {
    Write-Host ''
    Write-Host "==> $mesaj" -ForegroundColor Cyan
}

function Basarisiz($mesaj) {
    Write-Host ''
    Write-Host "SERVİS KURULUM HATASI: $mesaj" -ForegroundColor Red
    exit 1
}

$kimlik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Basarisiz 'Bu script YÖNETİCİ olarak çalıştırılmalı (Windows Servisi kaydı yönetici hakkı ister).'
}

# ---------- server.js ----------
$serverJs = Join-Path $UygulamaKlasoru 'server.js'
if (-not (Test-Path $serverJs)) {
    Basarisiz "server.js bulunamadı ($serverJs). -UygulamaKlasoru parametresini kontrol edin."
}

# ---------- node.exe ----------
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
    foreach ($aday in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")) {
        if (Test-Path $aday) { $nodeExe = $aday; break }
    }
}
if (-not $nodeExe) {
    Basarisiz @'
node.exe bulunamadı. Node.js kurulu olmalı (LTS sürümü önerilir).

Offline kurulumda Node.js MSI'ı (node-vXX-x64.msi) kurulum paketiyle birlikte
gelmelidir; https://nodejs.org adresinden indirilir.
'@
}
Write-Host "node.exe: $nodeExe"

# ---------- nssm.exe ----------
if (-not $NssmYolu) {
    $adaylar = @(
        (Join-Path $PSScriptRoot 'nssm.exe')
        (Join-Path $UygulamaKlasoru 'nssm.exe')
        (Join-Path $UygulamaKlasoru 'installer\nssm.exe')
        (Join-Path (Split-Path -Parent $PSScriptRoot) 'nssm.exe')
    )
    foreach ($aday in $adaylar) {
        if ($aday -and (Test-Path $aday)) { $NssmYolu = $aday; break }
    }
    if (-not $NssmYolu) {
        $NssmYolu = (Get-Command nssm.exe -ErrorAction SilentlyContinue).Source
    }
}
if (-not $NssmYolu -or -not (Test-Path $NssmYolu)) {
    Basarisiz @"
nssm.exe bulunamadı.

NSSM'i https://nssm.cc/download adresinden indirip (win64\nssm.exe) bu
script'in bulunduğu klasöre kopyalayın:
  $PSScriptRoot\nssm.exe
"@
}
Write-Host "nssm.exe: $NssmYolu"

# $Args OTOMATİK bir değişken olduğu için parametre adı olarak KULLANILMAZ
# (fonksiyon içinde gölgelenir ve beklenmedik davranışa yol açar).
function Nssm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NssmArgs)
    $cikti = & $NssmYolu @NssmArgs 2>&1
    # NSSM çıktısı UTF-16 olabiliyor; sadece hata durumunda gösteriyoruz.
    if ($LASTEXITCODE -ne 0) {
        throw "nssm $($NssmArgs -join ' ') başarısız (kod $LASTEXITCODE): $($cikti -join ' ')"
    }
}

# ---------- Log klasörü ----------
$logKlasoru = Join-Path $UygulamaKlasoru 'logs'
New-Item -ItemType Directory -Force -Path $logKlasoru | Out-Null

# ============================================================
# Servisi kur / güncelle
# ============================================================
$mevcut = Get-Service -Name $ServisAdi -ErrorAction SilentlyContinue

if ($mevcut) {
    Adim "'$ServisAdi' servisi zaten var — durduruluyor ve ayarları güncelleniyor..."
    if ($mevcut.Status -ne 'Stopped') {
        Stop-Service -Name $ServisAdi -Force -ErrorAction SilentlyContinue
        # NSSM'in süreci gerçekten sonlandırmasını bekle
        for ($i = 0; $i -lt 15; $i++) {
            $s = Get-Service -Name $ServisAdi -ErrorAction SilentlyContinue
            if (-not $s -or $s.Status -eq 'Stopped') { break }
            Start-Sleep -Seconds 1
        }
    }
    Nssm set $ServisAdi Application $nodeExe
} else {
    Adim "'$ServisAdi' Windows Servisi olarak kaydediliyor..."
    Nssm install $ServisAdi $nodeExe 'server.js'
}

Adim 'Servis ayarları uygulanıyor...'

Nssm set $ServisAdi AppParameters 'server.js'
Nssm set $ServisAdi AppDirectory $UygulamaKlasoru
Nssm set $ServisAdi DisplayName 'Restoran Otomasyonu - Backend'
Nssm set $ServisAdi Description 'Restoran Otomasyonu API sunucusu (http://localhost:4091) ve müşteri QR menüsü.'
Nssm set $ServisAdi Start SERVICE_AUTO_START

# Ayarlar .env'den okunuyor (dotenv, AppDirectory'den) — ama PORT'u burada da
# açıkça veriyoruz: .env kazara silinse/bozulsa bile servis 4091'i dinlemeli,
# çünkü Tauri exe'si bu adrese GÖMÜLÜ olarak bağlanıyor.
Nssm set $ServisAdi AppEnvironmentExtra 'PORT=4091' 'NODE_ENV=production'

# ---------- Çökme durumunda yeniden başlat (compose'daki restart: unless-stopped karşılığı) ----------
Nssm set $ServisAdi AppExit Default Restart
Nssm set $ServisAdi AppRestartDelay 5000          # 5 sn bekle
Nssm set $ServisAdi AppThrottle 10000             # 10 sn'den kısa sürede ölürse döngüye girme

# ---------- Servisin kendi stdout/stderr'i (uygulamanın winston logları ayrı) ----------
Nssm set $ServisAdi AppStdout (Join-Path $logKlasoru 'servis-cikti.log')
Nssm set $ServisAdi AppStderr (Join-Path $logKlasoru 'servis-hata.log')
Nssm set $ServisAdi AppRotateFiles 1
Nssm set $ServisAdi AppRotateOnline 1
Nssm set $ServisAdi AppRotateBytes 10485760       # 10 MB

# ---------- Durdurma sırası: önce nazikçe (CTRL+C), sonra sonlandır ----------
Nssm set $ServisAdi AppStopMethodConsole 5000
Nssm set $ServisAdi AppStopMethodWindow 5000
Nssm set $ServisAdi AppStopMethodThreads 5000

# ---------- SQL Server'dan SONRA başlasın ----------
# Backend açılışta connectDB() çağırıyor; SQL Server henüz ayakta değilse
# bağlantı hatası alır. Bağımlılık + AppExit Restart birlikte bunu kapatır.
try {
    & sc.exe config $ServisAdi depend= 'MSSQL$SQLEXPRESS' | Out-Null
} catch {
    Write-Host "UYARI: Servis bağımlılığı ayarlanamadı: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---------- Güvenlik duvarı: 4091 (panel aynı makinede ama menü telefonlardan açılıyor) ----------
Adim 'Güvenlik duvarında 4091/TCP açılıyor (müşteri menüsü telefonlardan erişilecek)...'
try {
    $kuralAdi = 'Restoran - Backend + Müşteri Menüsü (TCP 4091)'
    if (-not (Get-NetFirewallRule -DisplayName $kuralAdi -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $kuralAdi -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort 4091 -Profile Any | Out-Null
    }
} catch {
    Write-Host "UYARI: Güvenlik duvarı kuralı eklenemedi: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ============================================================
# Başlat ve doğrula
# ============================================================
Adim 'Servis başlatılıyor...'
Start-Service -Name $ServisAdi

$calisiyor = $false
for ($i = 0; $i -lt 20; $i++) {
    $s = Get-Service -Name $ServisAdi -ErrorAction SilentlyContinue
    if ($s -and $s.Status -eq 'Running') { $calisiyor = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $calisiyor) {
    Basarisiz "Servis başlatılamadı. Ayrıntı için: $logKlasoru\servis-hata.log"
}

# ---------- Gerçekten 4091'de yanıt veriyor mu? ----------
Adim 'Backend http://localhost:4091 adresinde yanıt veriyor mu, kontrol ediliyor...'
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
Servis çalışıyor ama http://localhost:4091 yanıt vermiyor.

Log dosyalarına bakın:
  $logKlasoru\servis-hata.log
  $logKlasoru\servis-cikti.log

En sık nedenler:
  - .env'de JWT_SECRET yok (server.js bu durumda bilerek hemen çıkar)
  - Veritabanına bağlanılamıyor (DB_SERVER / DB_PASSWORD hatalı)
  - 4091 portu başka bir uygulama tarafından kullanılıyor
"@
}

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host " '$ServisAdi' servisi çalışıyor." -ForegroundColor Green
Write-Host ' Backend      : http://localhost:4091/api' -ForegroundColor Green
Write-Host ' Müşteri menüsü: http://<bu-bilgisayarin-ip-adresi>:4091/<masa-qr-kodu>' -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
exit 0
