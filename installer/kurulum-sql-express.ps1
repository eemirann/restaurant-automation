<#
.SYNOPSIS
    SQL Server Express'i sessizce kurar ve backend'in bağlanabilmesi için
    gereken AYARLARI yapar.

.DESCRIPTION
    Docker'daki mssql/server konteynerinin yerini alır. Konteyner imajı
    "kutudan çıktığı gibi" TCP 1433'ü dinliyor ve Mixed Mode kimlik
    doğrulamasıyla sa hesabını açıyordu; SQL Server Express'in VARSAYILANLARI
    ise bunların İKİSİ DE KAPALIDIR. Bu script farkı kapatır:

      1) SQL Server Express'i sessiz (/QUIET) kurar — Mixed Mode (SECURITYMODE=SQL)
         ve sa şifresi kurulum parametresi olarak verilir.
      2) TCP/IP protokolünü ETKİNLEŞTİRİR (Express'te varsayılan: Disabled).
      3) Instance'a SABİT 1433 portunu atar (Express'te varsayılan: dinamik port).
      4) SQL Browser servisini otomatik başlatmaya alır — 'localhost\SQLEXPRESS'
         biçimindeki instance adıyla bağlanma bunu gerektirir.
      5) Windows Güvenlik Duvarı'nda 1433/TCP ve 1434/UDP'yi açar (yerel ağdaki
         diğer cihazlar için; backend aynı makinede olduğundan zorunlu değil).
      6) Yedekleme klasörüne SQL Server servis hesabına YAZMA izni verir
         (utils/backupScheduler.js "BACKUP DATABASE ... TO DISK" çalıştırır).
      7) Veritabanını oluşturur (IF DB_ID IS NULL CREATE DATABASE).

    TEKRAR ÇALIŞTIRILABİLİR: SQL Express zaten kuruluysa kurulum adımı
    atlanır, yapılandırma adımları yeniden uygulanır (hepsi idempotent).

.PARAMETER SaSifre
    sa hesabının şifresi. .env'deki DB_PASSWORD ile AYNI olmalı.

.PARAMETER KurulumDosyasi
    SQL Server Express kurulum dosyası. İki biçim de desteklenir:
      - SQLEXPR_x64_ENU.exe   (tam, offline paket — USB kurulumu için ÖNERİLEN)
      - SQL2022-SSEI-Expr.exe (küçük indirici — İNTERNET İSTER)
    Verilmezse script kendi klasöründe ve üst klasörde bu adları arar.

.PARAMETER InstanceAdi
    Varsayılan: SQLEXPRESS

.PARAMETER Veritabani
    Oluşturulacak veritabanı. Varsayılan: RestoranDB

.PARAMETER YedekKlasoru
    BACKUP DATABASE hedefi. Verilirse SQL Server servis hesabına yazma izni verilir.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File kurulum-sql-express.ps1 -SaSifre "Gizli!123"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SaSifre,

    [string]$KurulumDosyasi = '',
    [string]$InstanceAdi = 'SQLEXPRESS',
    [string]$Veritabani = 'RestoranDB',
    [string]$YedekKlasoru = ''
)

$ErrorActionPreference = 'Stop'

function Adim($mesaj) {
    Write-Host ''
    Write-Host "==> $mesaj" -ForegroundColor Cyan
}

function Basarisiz($mesaj) {
    Write-Host ''
    Write-Host "SQL EXPRESS KURULUM HATASI: $mesaj" -ForegroundColor Red
    exit 1
}

# ---------- Yönetici kontrolü ----------
$kimlik = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $kimlik.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Basarisiz 'Bu script YÖNETİCİ olarak çalıştırılmalı (SQL Server kurulumu ve servis ayarları yönetici hakkı ister).'
}

$servisAdi = "MSSQL`$$InstanceAdi"   # ör. MSSQL$SQLEXPRESS

# ============================================================
# 1) SQL Server Express kurulumu (zaten kuruluysa atlanır)
# ============================================================
$mevcutServis = Get-Service -Name $servisAdi -ErrorAction SilentlyContinue

if ($mevcutServis) {
    Adim "SQL Server Express ($InstanceAdi) zaten kurulu — kurulum adımı atlanıyor, ayarlar yeniden uygulanacak."
} else {
    Adim 'SQL Server Express kuruluyor (sessiz kurulum, birkaç dakika sürebilir)...'

    if (-not $KurulumDosyasi) {
        $aranan = @('SQLEXPR_x64_ENU.exe', 'SQL2022-SSEI-Expr.exe', 'SQL2019-SSEI-Expr.exe')
        $klasorler = @($PSScriptRoot, (Split-Path -Parent $PSScriptRoot))
        foreach ($k in $klasorler) {
            if (-not $k) { continue }
            foreach ($a in $aranan) {
                $aday = Join-Path $k $a
                if (Test-Path $aday) { $KurulumDosyasi = $aday; break }
            }
            if ($KurulumDosyasi) { break }
        }
    }

    if (-not $KurulumDosyasi -or -not (Test-Path $KurulumDosyasi)) {
        Basarisiz @"
SQL Server Express kurulum dosyası bulunamadı.

"SQLEXPR_x64_ENU.exe" dosyasını (Microsoft'un sitesinden, "SQL Server 2022
Express" > "Download Media" > "Express Core" seçeneğiyle indirilir) bu
script'in bulunduğu klasöre kopyalayıp tekrar çalıştırın.

İnternet varsa küçük indirici (SQL2022-SSEI-Expr.exe) de kullanılabilir,
ama USB/offline kurulum için TAM paket (SQLEXPR_x64_ENU.exe) gerekir.
"@
    }

    Write-Host "Kurulum dosyası: $KurulumDosyasi"

    # SQLEXPR_x64_ENU.exe kendi kendini açan bir arşivdir: önce /X ile
    # çıkarılır, sonra içinden çıkan SETUP.EXE parametrelerle çalıştırılır.
    # (Doğrudan çalıştırıp parametre geçmek sürüme göre değişken davranıyor.)
    $cikarmaKlasoru = Join-Path $env:TEMP 'RestoranSqlExpress'
    if (Test-Path $cikarmaKlasoru) { Remove-Item -Recurse -Force $cikarmaKlasoru }
    New-Item -ItemType Directory -Force -Path $cikarmaKlasoru | Out-Null

    $setupExe = $null
    if ((Split-Path -Leaf $KurulumDosyasi) -like 'SQLEXPR*') {
        Write-Host 'Kurulum arşivi açılıyor...'
        $p = Start-Process -FilePath $KurulumDosyasi `
            -ArgumentList "/Q", "/X:`"$cikarmaKlasoru`"" -Wait -PassThru
        if ($p.ExitCode -ne 0) { Basarisiz "Kurulum arşivi açılamadı (çıkış kodu: $($p.ExitCode))." }
        $setupExe = Join-Path $cikarmaKlasoru 'SETUP.EXE'
        if (-not (Test-Path $setupExe)) {
            $bulunan = Get-ChildItem -Path $cikarmaKlasoru -Filter 'SETUP.EXE' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($bulunan) { $setupExe = $bulunan.FullName } else { Basarisiz 'Açılan arşivde SETUP.EXE bulunamadı.' }
        }
    } else {
        # SSEI indiricisi: kendi indirip kurar, aynı parametreleri kabul eder.
        $setupExe = $KurulumDosyasi
    }

    # /SECURITYMODE=SQL  -> Mixed Mode Authentication (varsayılan: sadece Windows Auth)
    # /SAPWD             -> sa şifresi (Mixed Mode olmadan geçersiz)
    # /TCPENABLED=1      -> TCP/IP protokolü (Express varsayılanı: kapalı)
    # /NPENABLED=0       -> Named Pipes gerekmiyor
    $setupArgs = @(
        '/QUIET'
        '/IACCEPTSQLSERVERLICENSETERMS'
        '/ACTION=Install'
        '/FEATURES=SQLENGINE'
        "/INSTANCENAME=$InstanceAdi"
        '/SECURITYMODE=SQL'
        "/SAPWD=`"$SaSifre`""
        '/TCPENABLED=1'
        '/NPENABLED=0'
        '/SQLSVCSTARTUPTYPE=Automatic'
        '/BROWSERSVCSTARTUPTYPE=Automatic'
        "/SQLSYSADMINACCOUNTS=`"BUILTIN\Administrators`""
        '/UPDATEENABLED=0'
    )

    Write-Host 'Sessiz kurulum başlatıldı — ekranda ilerleme görünmez, lütfen bekleyin...'
    $p = Start-Process -FilePath $setupExe -ArgumentList $setupArgs -Wait -PassThru

    # 3010 = başarılı, yeniden başlatma gerekiyor
    if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) {
        Basarisiz @"
SQL Server Express sessiz kurulumu başarısız oldu (çıkış kodu: $($p.ExitCode)).

Ayrıntılı kurulum günlüğü:
C:\Program Files\Microsoft SQL Server\<sürüm>\Setup Bootstrap\Log\Summary.txt

Sık görülen nedenler:
  - Aynı isimde ($InstanceAdi) bozuk/yarım bir instance var
  - sa şifresi SQL Server parola politikasını karşılamıyor (en az 8 karakter,
    büyük+küçük harf, rakam ve sembol içermeli)
  - .NET Framework / Windows güncellemesi eksik
"@
    }
    if ($p.ExitCode -eq 3010) {
        Write-Host 'UYARI: Kurulum başarılı ama Windows yeniden başlatma istiyor. Kurulum bitince bilgisayarı yeniden başlatın.' -ForegroundColor Yellow
    }

    Write-Host 'SQL Server Express kuruldu.' -ForegroundColor Green
}

# ============================================================
# 2-3) TCP/IP protokolünü aç + sabit 1433 portu ata
#
# Bunlar SADECE kayıt defterinde tutulur (SQL Server Configuration Manager'ın
# yaptığı da budur). WMI/SqlWmiManagement kullanılmıyor — SMO bağımlılığı
# offline kurulumda güvenilir şekilde bulunmayabiliyor.
# ============================================================
Adim 'TCP/IP protokolü etkinleştiriliyor ve 1433 portu sabitleniyor...'

$mssqlKok = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server'
$instanceHaritasi = Get-ItemProperty -Path "$mssqlKok\Instance Names\SQL" -ErrorAction SilentlyContinue
if (-not $instanceHaritasi -or -not $instanceHaritasi.$InstanceAdi) {
    Basarisiz "Kayıt defterinde '$InstanceAdi' instance'ı bulunamadı — kurulum tamamlanmamış olabilir."
}
$instanceKimlik = $instanceHaritasi.$InstanceAdi   # ör. MSSQL16.SQLEXPRESS
$tcpKok = "$mssqlKok\$instanceKimlik\MSSQLServer\SuperSocketNetLib\Tcp"

if (-not (Test-Path $tcpKok)) {
    Basarisiz "TCP yapılandırma anahtarı bulunamadı: $tcpKok"
}

# TCP/IP protokolünü etkinleştir
Set-ItemProperty -Path $tcpKok -Name 'Enabled' -Value 1 -Type DWord

# TÜM IP'ler için: dinamik portu KAPAT (boş dize), sabit portu 1433 yap.
# IPAll dahil her IP alt anahtarı ayrı ayrı ayarlanır — Configuration
# Manager'da "IP Adresleri" sekmesindeki her satırın karşılığı budur.
foreach ($ipAnahtar in (Get-ChildItem -Path $tcpKok -ErrorAction SilentlyContinue)) {
    Set-ItemProperty -Path $ipAnahtar.PSPath -Name 'TcpDynamicPorts' -Value '' -Type String -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $ipAnahtar.PSPath -Name 'TcpPort' -Value '1433' -Type String -ErrorAction SilentlyContinue
    if ($ipAnahtar.PSChildName -ne 'IPAll') {
        Set-ItemProperty -Path $ipAnahtar.PSPath -Name 'Enabled' -Value 1 -Type DWord -ErrorAction SilentlyContinue
    }
}

# ---------- Mixed Mode Authentication (kurulum atlandıysa da garanti et) ----------
# LoginMode: 1 = sadece Windows Auth, 2 = Mixed Mode (SQL + Windows)
Adim 'Mixed Mode kimlik doğrulaması (SQL + Windows) açılıyor...'
$serverKok = "$mssqlKok\$instanceKimlik\MSSQLServer"
Set-ItemProperty -Path $serverKok -Name 'LoginMode' -Value 2 -Type DWord

# ============================================================
# 4) SQL Browser — 'localhost\SQLEXPRESS' ile bağlanmak için gerekli
# ============================================================
Adim 'SQL Browser servisi otomatik başlatmaya alınıyor...'
try {
    Set-Service -Name 'SQLBrowser' -StartupType Automatic
    Start-Service -Name 'SQLBrowser' -ErrorAction SilentlyContinue
} catch {
    Write-Host "UYARI: SQL Browser servisi ayarlanamadı: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---------- SQL Server servisini yeniden başlat (ayarlar ancak böyle geçerli olur) ----------
Adim 'SQL Server servisi yeniden başlatılıyor (yeni ayarların geçerli olması için)...'
Restart-Service -Name $servisAdi -Force
Set-Service -Name $servisAdi -StartupType Automatic

# ---------- Servisin gerçekten ayağa kalkmasını bekle ----------
$hazir = $false
for ($i = 0; $i -lt 30; $i++) {
    $s = Get-Service -Name $servisAdi -ErrorAction SilentlyContinue
    if ($s -and $s.Status -eq 'Running') { $hazir = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $hazir) { Basarisiz "SQL Server servisi ($servisAdi) çalışır duruma gelmedi." }

# ============================================================
# 5) Güvenlik duvarı kuralları
# ============================================================
Adim 'Windows Güvenlik Duvarı kuralları ekleniyor (1433/TCP, 1434/UDP)...'
foreach ($kural in @(
    @{ Ad = 'Restoran - SQL Server (TCP 1433)'; Protokol = 'TCP'; Port = 1433 },
    @{ Ad = 'Restoran - SQL Browser (UDP 1434)'; Protokol = 'UDP'; Port = 1434 }
)) {
    try {
        if (-not (Get-NetFirewallRule -DisplayName $kural.Ad -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $kural.Ad -Direction Inbound -Action Allow `
                -Protocol $kural.Protokol -LocalPort $kural.Port -Profile Any | Out-Null
        }
    } catch {
        Write-Host "UYARI: Güvenlik duvarı kuralı eklenemedi ($($kural.Ad)): $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# ============================================================
# 6) Yedek klasörüne SQL Server servis hesabı için yazma izni
# ============================================================
if ($YedekKlasoru) {
    Adim "Yedekleme klasörü hazırlanıyor ($YedekKlasoru)..."
    New-Item -ItemType Directory -Force -Path $YedekKlasoru | Out-Null
    # BACKUP DATABASE'i çalıştıran SQL Server SÜRECİDİR, bu Node süreci değil —
    # klasör yazılabilir olmazsa gece yedeklemesi sessizce başarısız olur.
    try {
        # ${servisAdi} zorunlu: '$servisAdi:' biçimi PowerShell'de kapsam
        # (scope) niteleyicisi olarak ayrıştırılır ve sözdizimi hatası verir.
        $sonuc = icacls $YedekKlasoru /grant "NT SERVICE\${servisAdi}:(OI)(CI)M" /T 2>&1
        if ($LASTEXITCODE -ne 0) { throw ($sonuc | Out-String) }
    } catch {
        Write-Host "UYARI: Yedek klasörüne SQL Server izni verilemedi: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host 'Otomatik yedekleme çalışmayabilir; klasöre elle "Değiştirme" izni verin.' -ForegroundColor Yellow
    }
}

# ============================================================
# 7) Bağlantıyı doğrula + veritabanını oluştur
# ============================================================
Adim 'sa hesabıyla bağlantı doğrulanıyor ve veritabanı oluşturuluyor...'

# sqlcmd yoksa (Express Core ile gelmeyebilir) .NET SqlClient ile bağlanılır —
# ek bir araç kurulumuna bağımlı kalmamak için tercih edilen yol budur.
$baglantiDizesi = "Server=localhost\$InstanceAdi;Database=master;User Id=sa;Password=$SaSifre;TrustServerCertificate=True;Connect Timeout=15"

$baglandi = $false
$sonHata = ''
for ($i = 0; $i -lt 15; $i++) {
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection $baglantiDizesi
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = "IF DB_ID('$Veritabani') IS NULL CREATE DATABASE [$Veritabani]"
        $cmd.ExecuteNonQuery() | Out-Null
        $conn.Close()
        $baglandi = $true
        break
    } catch {
        $sonHata = $_.Exception.Message
        Start-Sleep -Seconds 3
    }
}

if (-not $baglandi) {
    Basarisiz @"
SQL Server'a sa hesabıyla bağlanılamadı.

Son hata: $sonHata

Kontrol edilecekler:
  - '$servisAdi' servisi çalışıyor mu? (services.msc)
  - sa şifresi .env'deki DB_PASSWORD ile aynı mı?
  - SQL Express DAHA ÖNCE farklı bir sa şifresiyle kurulmuş olabilir. Bu durumda
    şifreyi Windows Auth ile sıfırlayın:
      sqlcmd -S localhost\$InstanceAdi -E -Q "ALTER LOGIN sa WITH PASSWORD='<yeni>'; ALTER LOGIN sa ENABLE;"
"@
}

Write-Host ''
Write-Host '==================================================================' -ForegroundColor Green
Write-Host " SQL Server Express hazır." -ForegroundColor Green
Write-Host " Instance : localhost\$InstanceAdi  (TCP 1433, Mixed Mode)" -ForegroundColor Green
Write-Host " Veritabanı: $Veritabani" -ForegroundColor Green
Write-Host '==================================================================' -ForegroundColor Green
exit 0
