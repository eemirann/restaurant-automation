; ============================================================
; Restoran Otomasyonu — Offline (USB, internetsiz) Kurulum Sihirbazı
;
; Önce scripts\paketle.ps1 çalıştırılıp KurulumPaketi\ klasörü (images.tar +
; Docker Desktop Installer.exe) hazırlanmalı. Bu script Inno Setup ile
; derlenince (Compile), çıktısı da OutputDir ayarı gereği aynı KurulumPaketi\
; klasörüne düşer — o klasörün TAMAMI USB'ye kopyalanır.
;
; Küçük proje dosyaları (migrations/, scripts/, docker-compose.yml,
; .env.example) doğrudan repodan (..\) gömülür — images.tar ve Docker Desktop
; Installer.exe ise BÜYÜK ikili dosyalar olduğu için gömülmez, kurulum
; programının kendisiyle AYNI klasörde (KurulumPaketi\) sibling olarak
; bulunmaları beklenir; Pascal kodu bunları çalışma anında oradan okur/kopyalar.
; ============================================================

#define MyAppName "Restoran Otomasyonu"
#define MyAppVersion "1.0"
#define MyAppURL "http://localhost:8080"

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
turkish.WelcomeLabel2=Bu sihirbaz, restoran otomasyon sistemini (veritabanı + sunucu + panel + müşteri menüsü) bu bilgisayara İNTERNET BAĞLANTISI GEREKMEDEN kuracak.%n%nDevam etmeden önce, kurulum programıyla aynı klasörde "images.tar" dosyasının bulunduğundan emin olun.
turkish.FinishedLabel={#MyAppName} kuruldu.%n%nMasaüstündeki "Restoran Paneli" kısayoluna tıklayarak paneli açabilirsiniz. İlk girişte, az önce belirlediğiniz kullanıcı adı ve PIN'i kullanın.

[Files]
Source: "..\migrations\*"; DestDir: "{app}\migrations"; Flags: recursesubdirs ignoreversion
Source: "..\scripts\*"; DestDir: "{app}\scripts"; Excludes: "paketle.ps1"; Flags: recursesubdirs ignoreversion
Source: "..\docker-compose.yml"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\.env.example"; DestDir: "{app}"; Flags: ignoreversion
Source: "postinstall.ps1"; DestDir: "{app}"; Flags: ignoreversion

[Code]
var
  DockerPage: TWizardPage;
  DockerStatusLabel: TNewStaticText;
  DockerInstallButton: TNewButton;
  DbPage: TInputQueryWizardPage;
  AdminPage: TInputQueryWizardPage;

// ============================================================
// Docker Desktop kurulu mu? (dosya + registry kontrolü)
// ============================================================
function IsDockerInstalled(): Boolean;
var
  RegKey: String;
begin
  Result := FileExists('C:\Program Files\Docker\Docker\Docker Desktop.exe');
  if not Result then
  begin
    RegKey := 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop';
    Result := RegKeyExists(HKLM, RegKey) or RegKeyExists(HKLM64, RegKey);
  end;
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
  Havuz[3] := '!@#%*-_';

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

// "Docker Desktop Kurulumunu Başlat" butonu — kurulum programıyla AYNI
// klasördeki (USB'de sibling) Docker Desktop Installer.exe'yi çalıştırır.
procedure DockerInstallButtonClick(Sender: TObject);
var
  KurulumDosyasi: String;
  ResultCode: Integer;
begin
  KurulumDosyasi := ExtractFileDir(ExpandConstant('{srcexe}')) + '\Docker Desktop Installer.exe';
  if not FileExists(KurulumDosyasi) then
  begin
    MsgBox('"Docker Desktop Installer.exe" bulunamadı.' + #13#10 + #13#10 +
      'Bu dosyayı https://www.docker.com/products/docker-desktop adresinden indirip, ' +
      'bu kurulum programıyla AYNI klasöre kopyalayıp sihirbazı tekrar başlatın.',
      mbError, MB_OK);
    Exit;
  end;

  if Exec(KurulumDosyasi, '', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
  begin
    MsgBox('Docker Desktop kurulumu tamamlandı (ya da pencere kapatıldı).' + #13#10 + #13#10 +
      'ÖNEMLİ: Docker Desktop kurulumu genellikle bilgisayarın YENİDEN BAŞLATILMASINI gerektirir. ' +
      'Bilgisayarını yeniden başlattıktan SONRA bu kurulum sihirbazını TEKRAR ÇALIŞTIR.' + #13#10 + #13#10 +
      'Eğer Docker Desktop kurulumu sırasında "sanallaştırma" / "virtualization" / "BIOS" ile ilgili ' +
      'bir hata aldıysan: bilgisayarının BIOS ayarlarından Intel VT-x / AMD-V sanallaştırmayı, ve ' +
      'Windows''ta "Windows Subsystem for Linux" ile "Virtual Machine Platform" özelliklerini ' +
      '(Denetim Masası > Programlar > Windows özelliklerini aç/kapat) açman gerekir. ' +
      'Bu sihirbaz bu ayarları senin için OTOMATİK DEĞİŞTİREMEZ.',
      mbInformation, MB_OK);
  end
  else
  begin
    MsgBox('Docker Desktop kurulum programı başlatılamadı.', mbError, MB_OK);
  end;

  WizardForm.Close;
end;

procedure InitializeWizard();
begin
  // ---------- Docker Desktop kontrol sayfası ----------
  DockerPage := CreateCustomPage(wpWelcome, 'Docker Desktop Kontrolü',
    'Sistem gereksinimleri kontrol ediliyor');

  DockerStatusLabel := TNewStaticText.Create(DockerPage);
  DockerStatusLabel.Parent := DockerPage.Surface;
  DockerStatusLabel.Left := 0;
  DockerStatusLabel.Top := 0;
  DockerStatusLabel.Width := DockerPage.SurfaceWidth;
  DockerStatusLabel.AutoSize := False;
  DockerStatusLabel.WordWrap := True;
  DockerStatusLabel.Height := 140;
  DockerStatusLabel.Caption :=
    'Docker Desktop bu bilgisayarda bulunamadı.' + #13#10 + #13#10 +
    'Restoran Otomasyonu, Docker Desktop üzerinde çalışır. Aşağıdaki butona tıklayarak ' +
    'kurulum paketindeki Docker Desktop kurulumunu başlatabilirsin.' + #13#10 + #13#10 +
    'Docker Desktop kurulumu genellikle bilgisayarın yeniden başlatılmasını gerektirir — ' +
    'kurulum bitip bilgisayarı yeniden başlattıktan SONRA bu sihirbazı tekrar çalıştır.';

  DockerInstallButton := TNewButton.Create(DockerPage);
  DockerInstallButton.Parent := DockerPage.Surface;
  DockerInstallButton.Left := 0;
  DockerInstallButton.Top := DockerStatusLabel.Top + DockerStatusLabel.Height + 16;
  DockerInstallButton.Width := 260;
  DockerInstallButton.Height := 28;
  DockerInstallButton.Caption := 'Docker Desktop Kurulumunu Başlat';
  DockerInstallButton.OnClick := @DockerInstallButtonClick;

  // ---------- Veritabanı şifresi sayfası ----------
  DbPage := CreateInputQueryPage(wpSelectDir,
    'Veritabanı Şifresi', 'Veritabanı yönetici (sa) şifresini belirleyin',
    'Aşağıda güçlü bir şifre otomatik oluşturuldu. Bu şifreyi NOT ALIN (veritabanına doğrudan ' +
    'erişim gerekirse lazım olur). Dilersen üzerine yazıp kendi şifreni de kullanabilirsin.');
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

// Docker kurulu ise kontrol sayfası hiç gösterilmez.
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = DockerPage.ID then
    Result := IsDockerInstalled();
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  i: Integer;
  Pin: String;
  PinOk: Boolean;
begin
  Result := True;

  if CurPageID = DockerPage.ID then
  begin
    if not IsDockerInstalled() then
    begin
      MsgBox('Devam etmeden önce Docker Desktop kurulu olmalı.' + #13#10 +
        '"Docker Desktop Kurulumunu Başlat" butonuna tıklayıp kurulumu tamamladıktan ve ' +
        'bilgisayarını yeniden başlattıktan sonra bu sihirbazı tekrar çalıştır.',
        mbError, MB_OK);
      Result := False;
    end;
    Exit;
  end;

  if CurPageID = DbPage.ID then
  begin
    if Trim(DbPage.Values[0]) = '' then
    begin
      MsgBox('Veritabanı şifresi boş olamaz.', mbError, MB_OK);
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
// Kurulum sonrası: .env yaz, images.tar'ı kopyala, postinstall.ps1'i
// çalıştır (docker load + compose up + migrate + ilk admin), masaüstü
// kısayolunu oluştur.
// ============================================================
procedure CurStepChanged(CurStep: TSetupStep);
var
  KaynakKlasor, TarKaynak: String;
  DbSifre, AdminAd, AdminKullanici, AdminPin, JwtSecret, EnvIcerik: String;
  PsYolu, PsParametreleri: String;
  ResultCode: Integer;
  Wsh, Kisayol: Variant;
  ChromeYolu, EdgeYolu, TarayiciYolu, MasaustuYolu: String;
begin
  if CurStep = ssPostInstall then
  begin
    // ---------- images.tar'ı kurulum klasörüne kopyala (USB'de sibling dosya) ----------
    KaynakKlasor := ExtractFileDir(ExpandConstant('{srcexe}'));
    TarKaynak := KaynakKlasor + '\images.tar';
    if FileExists(TarKaynak) then
      CopyFile(TarKaynak, ExpandConstant('{app}\images.tar'), False)
    else
    begin
      MsgBox('"images.tar" bulunamadı (' + KaynakKlasor + ').' + #13#10 +
        'Kurulum programının bulunduğu klasörde bu dosya olmalı — kurulum sonrası adımlar ' +
        '(docker load) başarısız olacak, dosyayı ekleyip installer\postinstall.ps1''i elle ' +
        'çalıştırabilirsin.', mbError, MB_OK);
    end;

    // ---------- .env dosyasını yaz ----------
    DbSifre := DbPage.Values[0];
    AdminAd := AdminPage.Values[0];
    AdminKullanici := AdminPage.Values[1];
    AdminPin := AdminPage.Values[2];
    JwtSecret := RastgeleDizeUret(48);

    EnvIcerik :=
      'DB_SERVER=db' + #13#10 +
      'DB_DATABASE=RestoranDB' + #13#10 +
      'DB_USER=sa' + #13#10 +
      'DB_PASSWORD=' + DbSifre + #13#10 +
      'DB_PORT=1433' + #13#10 +
      'JWT_SECRET=' + JwtSecret + #13#10 +
      'PORT=4091' + #13#10 +
      'NODE_ENV=production' + #13#10 +
      'CORS_ORIGIN=http://localhost:8080,http://localhost:8081' + #13#10 +
      'VITE_API_URL=http://localhost:4091/api' + #13#10 +
      'VITE_CUSTOMER_MENU_URL=http://localhost:8081' + #13#10 +
      '# Sihirbaz tarafından ilk admin oluşturmak için (postinstall.ps1 okur) - docker compose bunları yok sayar:' + #13#10 +
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
        'Docker Desktop''un çalıştığından emin olup şu komutu Yönetici olarak PowerShell''de elle tekrar deneyebilirsin:' + #13#10 +
        'powershell -ExecutionPolicy Bypass -File "' + PsYolu + '"',
        mbError, MB_OK);
    end
    else
    begin
      MsgBox('Kurulum tamamlandı!' + #13#10 + #13#10 +
        'Veritabanı şifresi: ' + DbSifre + #13#10 +
        '(Bu şifreyi bir yere not al — sadece burada gösteriliyor.)' + #13#10 + #13#10 +
        'Panel kullanıcı adı: ' + AdminKullanici + '   ·   PIN: ' + AdminPin,
        mbInformation, MB_OK);

      // ---------- Masaüstü kısayolu (Chrome/Edge --app modu, "native app" hissi) ----------
      ChromeYolu := 'C:\Program Files\Google\Chrome\Application\chrome.exe';
      if not FileExists(ChromeYolu) then
        ChromeYolu := 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe';
      EdgeYolu := 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe';
      if not FileExists(EdgeYolu) then
        EdgeYolu := 'C:\Program Files\Microsoft\Edge\Application\msedge.exe';

      TarayiciYolu := '';
      if FileExists(ChromeYolu) then TarayiciYolu := ChromeYolu
      else if FileExists(EdgeYolu) then TarayiciYolu := EdgeYolu;

      MasaustuYolu := ExpandConstant('{commondesktop}') + '\Restoran Paneli.lnk';
      try
        Wsh := CreateOleObject('WScript.Shell');
        Kisayol := Wsh.CreateShortcut(MasaustuYolu);
        if TarayiciYolu <> '' then
        begin
          Kisayol.TargetPath := TarayiciYolu;
          Kisayol.Arguments := '--app=http://localhost:8080';
        end
        else
        begin
          // Chrome/Edge bulunamadıysa varsayılan tarayıcıda normal bir kısayol.
          Kisayol.TargetPath := 'http://localhost:8080';
        end;
        Kisayol.WorkingDirectory := ExpandConstant('{app}');
        Kisayol.Description := 'Restoran Otomasyonu Paneli';
        Kisayol.Save;
      except
        // Kısayol oluşturulamazsa kurulumu bozma — kullanıcı elle
        // http://localhost:8080 adresini açabilir.
      end;
    end;
  end;
end;
