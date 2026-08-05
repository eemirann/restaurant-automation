; ============================================================
; Restoran Otomasyonu — Offline (USB, internetsiz) Kurulum Sihirbazı
;
; MİMARİ: Docker YOK. Veritabanı SQL Server Express (Windows'a doğrudan
; kurulur), backend ise NSSM ile kaydedilen bir Windows Servisi olarak
; çalışır. Müşteri QR menüsünü backend'in kendisi statik olarak servis
; eder (ayrı nginx konteyneri yok).
;
; !!! PORT 4091 SABİTTİR — DEĞİŞTİRMEYİN !!!
; restoran-panel, Tauri ile ayrı bir masaüstü .exe olarak paketlenmiştir ve
; backend adresi (http://localhost:4091) exe'nin İÇİNE BUILD ANINDA
; gömülüdür. Backend'in dinlediği port ya da API yolu (/api) değişirse var
; olan exe backend'i bulamaz ve YENİDEN DERLENMESİ gerekir.
;
; KAPSAM DIŞI: restoran-panel. Bu sihirbaz paneli ne derler ne kurar —
; Tauri exe'si AYRI dağıtılır ve kendi kurulumuna sahiptir.
;
; BÜYÜK İKİLİ DOSYALAR gömülmez; kurulum programının kendisiyle AYNI
; klasörde (KurulumPaketi\) sibling olarak bulunmaları beklenir:
;   - SQLEXPR_x64_ENU.exe   (SQL Server Express tam/offline paketi)
;   - node-vXX.X.X-x64.msi  (Node.js LTS — makinede Node yoksa)
; Küçük dosyalar (nssm.exe, migrations\, scripts\, ps1'ler) gömülür.
; ============================================================

#define MyAppName "Restoran Otomasyonu"
#define MyAppVersion "2.0"
#define MyAppURL "http://localhost:4091"

[Setup]
AppId={{E7A2C9B4-6F3D-4A1E-9C8B-2D5F7A3E1B60}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisherURL={#MyAppURL}
DefaultDirName=C:\RestoranOtomasyonu
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=admin
OutputDir=..\KurulumPaketi
OutputBaseFilename=RestoranKurulumSihirbazi
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Messages]
turkish.WelcomeLabel1=Restoran Otomasyonu Kurulum Sihirbazına Hoş Geldiniz
turkish.WelcomeLabel2=Bu sihirbaz, restoran otomasyon sisteminin VERİTABANINI (SQL Server Express) ve SUNUCUSUNU (Windows Servisi) bu bilgisayara kuracak.%n%nDevam etmeden önce, kurulum programıyla aynı klasörde "SQLEXPR_x64_ENU.exe" dosyasının bulunduğundan emin olun.%n%nNOT: Yönetim paneli (RESTO POS masaüstü uygulaması) AYRI olarak kurulur — bu sihirbaz onu kurmaz.
turkish.FinishedLabel={#MyAppName} sunucusu kuruldu ve çalışıyor.%n%nYönetim paneli için RESTO POS masaüstü uygulamasını açın. İlk girişte, az önce belirlediğiniz kullanıcı adı ve PIN'i kullanın.

[Files]
Source: "..\migrations\*"; DestDir: "{app}\migrations"; Flags: recursesubdirs ignoreversion
Source: "..\scripts\*"; DestDir: "{app}\scripts"; Excludes: "paketle.ps1,paketle-guncelle.ps1"; Flags: recursesubdirs ignoreversion
Source: "..\config\*"; DestDir: "{app}\config"; Flags: recursesubdirs ignoreversion
Source: "..\controllers\*"; DestDir: "{app}\controllers"; Flags: recursesubdirs ignoreversion
Source: "..\middleware\*"; DestDir: "{app}\middleware"; Flags: recursesubdirs ignoreversion
Source: "..\routes\*"; DestDir: "{app}\routes"; Flags: recursesubdirs ignoreversion
Source: "..\utils\*"; DestDir: "{app}\utils"; Flags: recursesubdirs ignoreversion
Source: "..\server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\.env.example"; DestDir: "{app}"; Flags: ignoreversion
; Müşteri QR menüsü — DERLENMİŞ çıktı gömülür (offline kurulumda npm build
; çalıştırılamayabilir). Derleyip paketlemek scripts\paketle.ps1'in işidir.
Source: "..\musteri-menu\dist\*"; DestDir: "{app}\musteri-menu\dist"; Flags: recursesubdirs ignoreversion skipifsourcedoesntexist
; Backend bağımlılıkları — offline kurulum için hazır node_modules.
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: recursesubdirs ignoreversion skipifsourcedoesntexist
; Kurulum script'leri
Source: "postinstall.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "kurulum-sql-express.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "servis-kur.ps1"; DestDir: "{app}"; Flags: ignoreversion
; NSSM (Non-Sucking Service Manager) — backend'i Windows Servisi yapmak için.
; https://nssm.cc/download > win64\nssm.exe dosyası installer\ klasörüne konur.
Source: "nssm.exe"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Code]
var
  SqlPage: TWizardPage;
  SqlStatusLabel: TNewStaticText;
  DbPage: TInputQueryWizardPage;
  AdminPage: TInputQueryWizardPage;

// ============================================================
// SQL Server Express kurulum dosyası (kurulum programıyla sibling) var mı?
// ============================================================
function SqlKurulumDosyasiYolu(): String;
var
  Klasor: String;
begin
  Klasor := ExtractFileDir(ExpandConstant('{srcexe}'));
  Result := Klasor + '\SQLEXPR_x64_ENU.exe';
  if FileExists(Result) then Exit;
  Result := Klasor + '\SQL2022-SSEI-Expr.exe';
  if FileExists(Result) then Exit;
  Result := '';
end;

// SQL Server Express zaten kurulu mu? (MSSQL$SQLEXPRESS servisinin kayıt anahtarı)
function IsSqlExpressInstalled(): Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL')
    and (RegValueExists(HKLM, 'SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL', 'SQLEXPRESS')
      or RegValueExists(HKLM64, 'SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL', 'SQLEXPRESS'));
end;

// Belirtilen uzunlukta rastgele (harf+rakam) dize üretir — JWT_SECRET için.
function RastgeleDizeUret(Uzunluk: Integer): String;
var
  Havuz: String;
  i: Integer;
begin
  Havuz := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  Result := '';
  for i := 1 to Uzunluk do
    Result := Result + Havuz[Random(Length(Havuz)) + 1];
end;

// Güçlü bir veritabanı şifresi üretir: en az bir büyük harf, küçük harf,
// rakam ve sembol İÇERMESİ GARANTİ edilir (MSSQL parola politikası için).
function GucluSifreUret(): String;
var
  Havuz: array[0..3] of String;
  Temel: String;
  i, j: Integer;
  Gecici: Char;
begin
  Havuz[0] := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  Havuz[1] := 'abcdefghijkmnpqrstuvwxyz';
  Havuz[2] := '23456789';
  // NOT: '%' ve '&' BİLEREK yok — .env'e yazılıp PowerShell/komut satırından
  // geçen bir şifrede kaçış sorunlarına yol açabiliyorlar.
  Havuz[3] := '!@#*-_';

  Temel := '';
  for i := 0 to 3 do
    Temel := Temel + Havuz[i][Random(Length(Havuz[i])) + 1];
  for i := 1 to 8 do
  begin
    j := Random(4);
    Temel := Temel + Havuz[j][Random(Length(Havuz[j])) + 1];
  end;

  // Basit karıştırma (Fisher-Yates)
  for i := Length(Temel) downto 2 do
  begin
    j := Random(i) + 1;
    Gecici := Temel[i];
    Temel[i] := Temel[j];
    Temel[j] := Gecici;
  end;

  Result := Temel;
end;

procedure InitializeWizard();
begin
  // ---------- SQL Server Express ön kontrol sayfası ----------
  SqlPage := CreateCustomPage(wpWelcome, 'Veritabanı Sunucusu',
    'SQL Server Express kurulum dosyası kontrol ediliyor');

  SqlStatusLabel := TNewStaticText.Create(SqlPage);
  SqlStatusLabel.Parent := SqlPage.Surface;
  SqlStatusLabel.Left := 0;
  SqlStatusLabel.Top := 0;
  SqlStatusLabel.Width := SqlPage.SurfaceWidth;
  SqlStatusLabel.AutoSize := False;
  SqlStatusLabel.WordWrap := True;
  SqlStatusLabel.Height := 180;
  SqlStatusLabel.Caption :=
    'Bu bilgisayarda SQL Server Express bulunamadı ve kurulum dosyası da yok.' + #13#10 + #13#10 +
    '"SQLEXPR_x64_ENU.exe" dosyasını bu kurulum programıyla AYNI klasöre kopyalayıp ' +
    'sihirbazı tekrar başlatın.' + #13#10 + #13#10 +
    'Dosya Microsoft''un sitesinden indirilir:' + #13#10 +
    'SQL Server 2022 Express > Download Media > Express Core (SQLEXPR_x64_ENU.exe)' + #13#10 + #13#10 +
    'Sihirbaz SQL Server Express''i SESSİZCE kurar; TCP/IP protokolünü, Mixed Mode ' +
    'kimlik doğrulamasını ve sa şifresini otomatik yapılandırır.';

  // ---------- Veritabanı şifresi sayfası ----------
  DbPage := CreateInputQueryPage(wpSelectDir,
    'Veritabanı Şifresi', 'Veritabanı yönetici (sa) şifresini belirleyin',
    'Aşağıda güçlü bir şifre otomatik oluşturuldu. Bu şifreyi NOT ALIN (veritabanına doğrudan ' +
    'erişim gerekirse lazım olur). Dilersen üzerine yazıp kendi şifreni de kullanabilirsin — ' +
    'SQL Server parola politikası gereği en az 8 karakter olmalı ve büyük harf, küçük harf, ' +
    'rakam ile sembol içermeli.');
  DbPage.Add('Veritabanı Şifresi:', False);
  DbPage.Values[0] := GucluSifreUret();

  // ---------- İlk admin sayfası ----------
  AdminPage := CreateInputQueryPage(DbPage.ID,
    'İlk Yönetici Kullanıcısı', 'Panele giriş yapacak ilk yönetici hesabını oluşturun',
    'Bu bilgilerle panelde bir Admin hesabı oluşturulacak. Kurulumdan sonra Kullanıcılar ' +
    'sayfasından yeni personel ekleyebilir, PIN''ini değiştirebilirsin.');
  AdminPage.Add('Ad Soyad:', False);
  AdminPage.Add('Kullanıcı Adı:', False);
  AdminPage.Add('PIN (4-6 haneli rakam):', False);
end;

// SQL Express zaten kuruluysa ya da kurulum dosyası hazırsa uyarı sayfası
// hiç gösterilmez.
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = SqlPage.ID then
    Result := IsSqlExpressInstalled() or (SqlKurulumDosyasiYolu() <> '');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  i: Integer;
  Pin: String;
  PinOk: Boolean;
begin
  Result := True;

  if CurPageID = SqlPage.ID then
  begin
    if not (IsSqlExpressInstalled() or (SqlKurulumDosyasiYolu() <> '')) then
    begin
      MsgBox('Devam edilemiyor: SQL Server Express ne kurulu ne de kurulum dosyası bulundu.' + #13#10 + #13#10 +
        '"SQLEXPR_x64_ENU.exe" dosyasını bu kurulum programıyla aynı klasöre kopyalayıp ' +
        'sihirbazı tekrar başlatın.', mbError, MB_OK);
      Result := False;
    end;
    Exit;
  end;

  if CurPageID = DbPage.ID then
  begin
    if Length(Trim(DbPage.Values[0])) < 8 then
    begin
      MsgBox('Veritabanı şifresi en az 8 karakter olmalı (SQL Server parola politikası).', mbError, MB_OK);
      Result := False;
    end;
    Exit;
  end;

  if CurPageID = AdminPage.ID then
  begin
    if Trim(AdminPage.Values[0]) = '' then
    begin
      MsgBox('Ad Soyad boş olamaz.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Trim(AdminPage.Values[1]) = '' then
    begin
      MsgBox('Kullanıcı adı boş olamaz.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    Pin := AdminPage.Values[2];
    PinOk := (Length(Pin) >= 4) and (Length(Pin) <= 6);
    if PinOk then
      for i := 1 to Length(Pin) do
        if not ((Pin[i] >= '0') and (Pin[i] <= '9')) then
          PinOk := False;

    if not PinOk then
    begin
      MsgBox('PIN 4-6 haneli, sadece rakamlardan oluşmalı.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

// ============================================================
// Kurulum öncesi: eski Windows Servisi çalışıyorsa durdur — aksi halde
// node.exe dosyaları kilitler ve üzerine yazılamaz (yeniden kurulum/güncelleme).
// ============================================================
procedure DurdurEskiServis();
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\sc.exe'), 'stop RestoranBackend', '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode);
  // Servisin gerçekten durması için kısa bekleme.
  Sleep(3000);
end;

// ============================================================
// Kurulum sonrası: .env yaz, SQL Express kurulum dosyasını kopyala,
// postinstall.ps1'i çalıştır (SQL Express + migrate + ilk admin + servis).
// ============================================================
procedure CurStepChanged(CurStep: TSetupStep);
var
  KaynakKlasor, SqlKaynak, SqlHedef: String;
  DbSifre, AdminAd, AdminKullanici, AdminPin, JwtSecret, EnvIcerik: String;
  PsYolu, PsParametreleri: String;
  ResultCode: Integer;
  FindRec: TFindRec;
begin
  if CurStep = ssInstall then
  begin
    DurdurEskiServis();
    Exit;
  end;

  if CurStep = ssPostInstall then
  begin
    KaynakKlasor := ExtractFileDir(ExpandConstant('{srcexe}'));

    // ---------- SQL Express kurulum dosyasını kurulum klasörüne kopyala ----------
    // (postinstall.ps1 / kurulum-sql-express.ps1 onu {app} içinde arar.)
    SqlKaynak := SqlKurulumDosyasiYolu();
    if SqlKaynak <> '' then
    begin
      SqlHedef := ExpandConstant('{app}\') + ExtractFileName(SqlKaynak);
      CopyFile(SqlKaynak, SqlHedef, False);
    end;

    // ---------- Node.js MSI'ı varsa kopyala (makinede Node yoksa lazım) ----------
    if FindFirst(KaynakKlasor + '\node-v*-x64.msi', FindRec) then
    begin
      try
        repeat
          CopyFile(KaynakKlasor + '\' + FindRec.Name,
                   ExpandConstant('{app}\') + FindRec.Name, False);
        until not FindNext(FindRec);
      finally
        FindClose(FindRec);
      end;
    end;

    // ---------- .env dosyasını yaz ----------
    DbSifre := DbPage.Values[0];
    AdminAd := AdminPage.Values[0];
    AdminKullanici := AdminPage.Values[1];
    AdminPin := AdminPage.Values[2];
    JwtSecret := RastgeleDizeUret(48);

    // DB_SERVER: adlandırılmış instance (SQL Server Express'in kurulum şekli).
    // config/db.js bu biçimi tanıyıp tedious'a instanceName olarak geçirir.
    // PORT=4091 SABİT — Tauri exe'si bu adrese gömülü bağlanıyor.
    EnvIcerik :=
      'DB_SERVER=localhost\SQLEXPRESS' + #13#10 +
      'DB_DATABASE=RestoranDB' + #13#10 +
      'DB_USER=sa' + #13#10 +
      'DB_PASSWORD=' + DbSifre + #13#10 +
      'DB_PORT=1433' + #13#10 +
      'JWT_SECRET=' + JwtSecret + #13#10 +
      'PORT=4091' + #13#10 +
      'NODE_ENV=production' + #13#10 +
      '# CORS: Tauri paneli (masaüstü exe) origin''leri config/cors.js''te HER ZAMAN' + #13#10 +
      '# eklidir. Buradaki liste müşteri menüsü ve yerel tarayıcı erişimi içindir;' + #13#10 +
      '# menü artık backend ile AYNI origin''den (4091) servis edildiği için CORS''a' + #13#10 +
      '# takılmaz.' + #13#10 +
      'CORS_ORIGIN=http://localhost:4091' + #13#10 +
      '# Yedekleme: SQL Server ve backend AYNI makinede olduğu için iki yol da aynı klasör.' + #13#10 +
      'BACKUP_FS_DIR=' + ExpandConstant('{app}\db-backups') + #13#10 +
      'BACKUP_DISK_DIR=' + ExpandConstant('{app}\db-backups') + #13#10 +
      '# Sihirbaz tarafından ilk admin oluşturmak için (postinstall.ps1 okur):' + #13#10 +
      'INSTALLER_ADMIN_FULLNAME=' + AdminAd + #13#10 +
      'INSTALLER_ADMIN_USERNAME=' + AdminKullanici + #13#10 +
      'INSTALLER_ADMIN_PIN=' + AdminPin + #13#10;

    SaveStringToFile(ExpandConstant('{app}\.env'), EnvIcerik, False);

    // ---------- postinstall.ps1'i çalıştır ----------
    PsYolu := ExpandConstant('{app}\postinstall.ps1');
    PsParametreleri := '-NoProfile -ExecutionPolicy Bypass -File "' + PsYolu + '"';

    if not Exec('powershell.exe', PsParametreleri, ExpandConstant('{app}'),
         SW_SHOW, ewWaitUntilTerminated, ResultCode) then
    begin
      MsgBox('Kurulum sonrası script başlatılamadı.', mbError, MB_OK);
    end
    else if ResultCode <> 0 then
    begin
      MsgBox('Kurulum sonrası adımlar sırasında bir hata oluştu (kod: ' + IntToStr(ResultCode) + ').' + #13#10 + #13#10 +
        'Hata mesajını okumak için şu komutu Yönetici olarak PowerShell''de elle tekrar çalıştırabilirsin:' + #13#10 +
        'powershell -ExecutionPolicy Bypass -File "' + PsYolu + '"',
        mbError, MB_OK);
    end
    else
    begin
      MsgBox('Kurulum tamamlandı!' + #13#10 + #13#10 +
        'Veritabanı şifresi: ' + DbSifre + #13#10 +
        '(Bu şifreyi bir yere not al — sadece burada gösteriliyor.)' + #13#10 + #13#10 +
        'Panel kullanıcı adı: ' + AdminKullanici + '   ·   PIN: ' + AdminPin + #13#10 + #13#10 +
        'Sunucu artık "RestoranBackend" adlı bir Windows Servisi olarak çalışıyor ve ' +
        'bilgisayar her açıldığında otomatik başlar.' + #13#10 + #13#10 +
        'Yönetim paneli için RESTO POS masaüstü uygulamasını kullanın.',
        mbInformation, MB_OK);
    end;
  end;
end;

// ============================================================
// Kaldırma: Windows Servisini durdur ve kaydını sil. Bu yapılmazsa
// "RestoranBackend" servisi kaldırma sonrası hayalet olarak kalır.
// SQL Server Express ve veritabanı BİLEREK KALDIRILMAZ — restoranın tüm
// verisi orada; silmek geri dönülemez veri kaybı olurdu.
// ============================================================
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  NssmYolu: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    Exec(ExpandConstant('{sys}\sc.exe'), 'stop RestoranBackend', '', SW_HIDE,
      ewWaitUntilTerminated, ResultCode);
    Sleep(3000);

    NssmYolu := ExpandConstant('{app}\nssm.exe');
    if FileExists(NssmYolu) then
      Exec(NssmYolu, 'remove RestoranBackend confirm', '', SW_HIDE,
        ewWaitUntilTerminated, ResultCode)
    else
      Exec(ExpandConstant('{sys}\sc.exe'), 'delete RestoranBackend', '', SW_HIDE,
        ewWaitUntilTerminated, ResultCode);

    MsgBox('Sunucu kaldırıldı.' + #13#10 + #13#10 +
      'NOT: SQL Server Express ve RestoranDB veritabanı BİLEREK KALDIRILMADI — ' +
      'restoranın tüm verisi orada duruyor. Gerçekten silmek istiyorsan ' +
      'Denetim Masası > Programlar''dan SQL Server''ı elle kaldır.',
      mbInformation, MB_OK);
  end;
end;
