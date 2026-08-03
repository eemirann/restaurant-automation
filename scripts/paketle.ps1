<#
.SYNOPSIS
    Restoran Otomasyonu'nu offline (USB'den, internetsiz) kurulum için paketler.

.DESCRIPTION
    Evde/ofiste, İNTERNET BAĞLANTISI OLAN bir geliştirici makinesinde BİR KEZ
    çalıştırılır. Şunları yapar:
      1) docker compose build ile backend/panel/customer-menu imajlarını derler.
      2) mcr.microsoft.com/mssql/server:2022-latest imajını indirir.
      3) 4 imajı da TEK BİR images.tar dosyasına aktarır (docker save).
      4) Küçük proje dosyalarını (migrations/, scripts/, docker-compose.yml,
         .env.example — node_modules HARİÇ, imajların içinde zaten var) +
         images.tar dosyasını KurulumPaketi\ klasöründe toplar.

    Bu script Docker Desktop Installer.exe'yi İNDİRMEZ — kullanıcı bunu
    https://www.docker.com/products/docker-desktop adresinden ayrıca indirip
    KurulumPaketi\ klasörüne KENDİSİ koymalıdır (script sonunda hatırlatılır).

    KurulumPaketi\ klasörü hazır olduktan sonra installer\RestoranKurulum.iss
    Inno Setup ile derlenir (Inno Setup IDE'de aç + Compile, ya da ISCC.exe ile);
    derlenen kurulum programı da OutputDir ayarı gereği aynı KurulumPaketi\
    klasörüne düşer. O klasörün TAMAMI USB'ye kopyalanır.

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
Adim 'Docker kontrol ediliyor...'
$dockerVar = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerVar) {
    Basarisiz 'Docker bulunamadı. Bu script, imajları DERLEMEK için bu makinede Docker Desktop kurulu ve ÇALIŞIYOR olmalı (paketleme makinesi internete bağlı olmalı; hedef/USB ile kurulacak makine internetsiz kalabilir).'
}
try {
    docker info *> $null
} catch {
    Basarisiz 'Docker Desktop çalışmıyor gibi görünüyor. Docker Desktop''u başlatıp tekrar deneyin.'
}

Set-Location $kokDizin

# ---------- 1) İmajları derle + indir ----------
Adim 'backend/panel/customer-menu imajları derleniyor (docker compose build)...'
docker compose build
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker compose build başarısız oldu.' }

Adim 'MSSQL imajı indiriliyor (docker pull mcr.microsoft.com/mssql/server:2022-latest)...'
docker pull mcr.microsoft.com/mssql/server:2022-latest
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker pull başarısız oldu.' }

# ---------- 2) Çıkış klasörünü hazırla ----------
Adim "Çıkış klasörü hazırlanıyor: $CikisKlasoru"
if (Test-Path $CikisKlasoru) {
    Remove-Item $CikisKlasoru -Recurse -Force
}
New-Item -ItemType Directory -Path $CikisKlasoru | Out-Null

# ---------- 3) Tüm imajları TEK bir tar dosyasına aktar ----------
Adim 'İmaj etiketleri belirleniyor (docker compose config --images)...'
$imajlar = docker compose config --images
if ($LASTEXITCODE -ne 0 -or -not $imajlar) { Basarisiz 'İmaj listesi alınamadı (docker compose config --images).' }
Write-Host ($imajlar -join "`n")

$tarYolu = Join-Path $CikisKlasoru 'images.tar'
Adim "İmajlar TEK bir dosyaya aktarılıyor: $tarYolu (bu birkaç dakika sürebilir)"
docker save -o $tarYolu @imajlar
if ($LASTEXITCODE -ne 0) { Basarisiz 'docker save başarısız oldu.' }

# ---------- 4) Küçük proje dosyalarını kopyala (node_modules HARİÇ) ----------
Adim 'Proje dosyaları kopyalanıyor (migrations/, scripts/, docker-compose.yml, .env.example)...'
Copy-Item (Join-Path $kokDizin 'migrations') (Join-Path $CikisKlasoru 'migrations') -Recurse
Copy-Item (Join-Path $kokDizin 'scripts') (Join-Path $CikisKlasoru 'scripts') -Recurse -Exclude 'paketle.ps1'
Copy-Item (Join-Path $kokDizin 'docker-compose.yml') $CikisKlasoru
Copy-Item (Join-Path $kokDizin '.env.example') $CikisKlasoru

# node_modules zaten kopyalanmadı (yukarıda hiç referans verilmedi) — imajların
# içinde zaten kurulu, host'ta migrate.js/createFirstAdmin.js'i host'tan
# ÇALIŞTIRMIYORUZ (bkz. installer/postinstall.ps1 -> docker compose exec/run,
# script'ler KONTEYNER İÇİNDE çalışır), o yüzden host'ta node_modules gerekmiyor.

# ---------- 5) Özet ----------
$tarBoyutMB = [math]::Round((Get-Item $tarYolu).Length / 1MB, 1)
Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host " Paketleme tamamlandı: $CikisKlasoru" -ForegroundColor Green
Write-Host " images.tar: $tarBoyutMB MB" -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
Write-Host ''
Write-Host 'SONRAKİ ADIMLAR:' -ForegroundColor Yellow
Write-Host " 1) ""Docker Desktop Installer.exe""'yi https://www.docker.com/products/docker-desktop adresinden indirip"
Write-Host "    şu klasöre KENDİN kopyala: $CikisKlasoru"
Write-Host ' 2) installer\RestoranKurulum.iss dosyasını Inno Setup ile derle (Compile).'
Write-Host "    Derlenen kurulum programı otomatik olarak $CikisKlasoru içine düşecek."
Write-Host " 3) $CikisKlasoru klasörünün TAMAMINI USB belleğe kopyala."
Write-Host ''
