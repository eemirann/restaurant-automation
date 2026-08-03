<#
.SYNOPSIS
    Var olan (USB'den offline kurulmuş) bir Restoran Otomasyonu kurulumunu
    GÜNCELLEMEK için küçük bir paket hazırlar (paketle.ps1'in aksine, tüm
    imajları değil sadece DEĞİŞEN servisleri paketler — çok daha hızlı).

.DESCRIPTION
    Bu (internete bağlı, kod değişikliğinin yapıldığı) geliştirici
    makinesinde çalıştırılır. Şunları yapar:
      1) Belirtilen servisleri derler (docker compose build).
      2) Sadece o servislerin imajlarını TEK bir guncelleme.tar dosyasına
         aktarır (docker save) — veritabanı (db) imajı hiç dokunulmadığı
         için pakete dahil edilmez.
      3) migrations\ klasörünü de pakete ekler (yeni migration dosyası
         eklenmiş olabilir; küçük olduğu için her zaman dahil edilir).
      4) installer\guncelle.ps1'i de pakete ekler.

    Çıkan Guncelleme\ klasörünün TAMAMI USB ile hedef bilgisayara taşınır;
    orada C:\RestoranOtomasyonu (ya da kurulumun yapıldığı klasör) içine
    kopyalanıp guncelle.ps1 çalıştırılır.

.EXAMPLE
    # Sadece paneli değiştirdiyseniz:
    powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1 -Servisler panel

    # Backend + panel değiştiyse (varsayılan: ikisi de + customer-menu):
    powershell -ExecutionPolicy Bypass -File scripts\paketle-guncelle.ps1
#>

[CmdletBinding()]
param(
    # Hangi servisler yeniden derlenip pakete dahil edilecek.
    [string[]]$Servisler = @('backend', 'panel', 'customer-menu'),

    # Çıkış klasörü (varsayılan: proje kökünde Guncelleme\).
    [string]$CikisKlasoru
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

# ---------- 0) Ön kontroller ----------
Adim 'Docker kontrol ediliyor...'
$dockerVar = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerVar) {
    Basarisiz 'Docker bulunamadı. Bu makinede Docker Desktop kurulu ve çalışıyor olmalı.'
}
try {
    docker info *> $null
} catch {}
if ($LASTEXITCODE -ne 0) {
    Basarisiz 'Docker Desktop çalışmıyor gibi görünüyor. Docker Desktop''u başlatıp tekrar deneyin.'
}

Set-Location $kokDizin

# ---------- 1) Belirtilen servisleri derle ----------
Adim "Servisler derleniyor (docker compose build $($Servisler -join ' '))..."
docker compose build @Servisler
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker compose build başarısız oldu.' }

# ---------- 2) Çıkış klasörünü hazırla ----------
Adim "Çıkış klasörü hazırlanıyor: $CikisKlasoru"
if (Test-Path $CikisKlasoru) {
    Remove-Item $CikisKlasoru -Recurse -Force
}
New-Item -ItemType Directory -Path $CikisKlasoru | Out-Null

# ---------- 3) Sadece bu servislerin imajlarını tek dosyaya aktar ----------
# NOT: 'docker compose config --images <servis>' bu compose sürümünde servis
# adına göre FİLTRELEME yapmıyor (tüm imajları döndürüyor) — bu yüzden imaj
# etiketini docker-compose.yml'deki SABİT proje adından ('name: restoran-otomasyonu')
# doğrudan türetiyoruz: <proje-adı>-<servis>:latest.
Adim 'İmaj etiketleri belirleniyor...'
if ($Servisler -contains 'db') {
    Basarisiz "'db' servisi (mcr.microsoft.com/mssql/server) bu script ile güncellenmez — veritabanı imajı zaten değişmiyor."
}
$imajlar = @($Servisler | ForEach-Object { "restoran-otomasyonu-${_}:latest" })
foreach ($imaj in $imajlar) {
    docker image inspect $imaj *> $null
    if ($LASTEXITCODE -ne 0) { Basarisiz "'$imaj' imajı bulunamadı — 'docker compose build' başarılı oldu mu kontrol edin." }
}
Write-Host ($imajlar -join "`n")

$tarYolu = Join-Path $CikisKlasoru 'guncelleme.tar'
Adim "İmajlar tek bir dosyaya aktarılıyor: $tarYolu"
docker save -o $tarYolu @imajlar
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker save başarısız oldu.' }

# ---------- 4) migrations\ ve guncelle.ps1'i pakete ekle ----------
Adim 'migrations\ klasörü ve guncelle.ps1 kopyalanıyor...'
Copy-Item (Join-Path $kokDizin 'migrations') (Join-Path $CikisKlasoru 'migrations') -Recurse
Copy-Item (Join-Path $kokDizin 'installer\guncelle.ps1') $CikisKlasoru

# ---------- 5) Özet ----------
$tarBoyutMB = [math]::Round((Get-Item $tarYolu).Length / 1MB, 1)
Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host " Güncelleme paketi hazır: $CikisKlasoru" -ForegroundColor Green
Write-Host " guncelleme.tar: $tarBoyutMB MB  (servisler: $($Servisler -join ', '))" -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
Write-Host ''
Write-Host 'SONRAKİ ADIMLAR:' -ForegroundColor Yellow
Write-Host " 1) $CikisKlasoru klasörünün TAMAMINI USB belleğe kopyala."
Write-Host ' 2) Hedef bilgisayarda, USB''deki bu klasörün içeriğini kurulum klasörüne'
Write-Host '    (ör. C:\RestoranOtomasyonu) kopyala (migrations\ ve guncelleme.tar üzerine yazılabilir).'
Write-Host ' 3) Yönetici olarak PowerShell aç, şunu çalıştır:'
Write-Host '    powershell -ExecutionPolicy Bypass -File "C:\RestoranOtomasyonu\guncelle.ps1"'
Write-Host ''
