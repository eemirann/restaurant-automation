// RESTO POS — Tauri masaüstü kabuğu
//
// Sorumluluğu SADECE şunlardır (iş mantığına DOKUNMAZ):
//   1) Express backend'ini (server.js) uygulama açılışında alt süreç olarak başlatmak
//   2) Backend hazır olana kadar açılış (splash) ekranı göstermek
//   3) Sistem tepsisi (tray) + tepsiye küçültme / geri getirme
//   4) Kapanışta backend sürecini süreç ağacıyla birlikte güvenle durdurmak
//
// Backend HTTP API'si ve React paneli olduğu gibi kalır; bu katman hiçbir
// iş kuralını değiştirmez.

// Üretim derlemesinde arkada siyah konsol penceresi açılmasını engeller.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::{Ipv4Addr, SocketAddrV4, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};

/// Backend'in dinlediği port (config/.env ile aynı olmalı).
const BACKEND_PORT: u16 = 4091;
/// Backend'in ayağa kalkması için beklenecek azami süre.
const BACKEND_HAZIR_TIMEOUT: Duration = Duration::from_secs(60);

/// Başlatılan backend alt süreci. Uygulama kapanırken durdurulur.
struct BackendSureci(Mutex<Option<Child>>);

// ============================================================
// Windows Job Object — öksüz backend'e karşı işletim sistemi güvencesi
//
// `backend_durdur` yalnızca DÜZGÜN kapanışta çalışır. Uygulama çökerse ya da
// Görev Yöneticisi'nden sonlandırılırsa backend arkada kalır: 4091 portunu
// tutar ve kurulum "node.exe dosya yazmak için açılırken hata" verir.
//
// Job Object'e JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE koyup backend'i bu nesneye
// atarsak, ana süreç sonlandığı anda (handle kapanır) çekirdek alt süreçleri
// de öldürür. Nesnenin uygulama ömrü boyunca YAŞAMASI gerekir — bu yüzden
// Tauri state'inde tutulur.
// ============================================================
#[cfg(windows)]
struct IsNesnesi(windows_sys::Win32::Foundation::HANDLE);

// HANDLE ham işaretçidir; yalnızca saklıyoruz (thread'ler arası taşınması güvenli).
#[cfg(windows)]
unsafe impl Send for IsNesnesi {}
#[cfg(windows)]
unsafe impl Sync for IsNesnesi {}

#[cfg(windows)]
fn is_nesnesi_olustur() -> Option<IsNesnesi> {
    use windows_sys::Win32::System::JobObjects::{
        CreateJobObjectW, SetInformationJobObject, JobObjectExtendedLimitInformation,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            eprintln!("[resto] Job Object oluşturulamadı");
            return None;
        }

        let mut bilgi: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        bilgi.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let sonuc = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &bilgi as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if sonuc == 0 {
            eprintln!("[resto] Job Object yapılandırılamadı");
            return None;
        }
        Some(IsNesnesi(job))
    }
}

/// Alt süreci Job Object'e bağlar; başarısızlık ÖLÜMCÜL DEĞİLDİR
/// (düzgün kapanışta `backend_durdur` yine devreye girer).
#[cfg(windows)]
fn is_nesnesine_ekle(job: &IsNesnesi, child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;

    unsafe {
        if AssignProcessToJobObject(job.0, child.as_raw_handle() as _) == 0 {
            eprintln!("[resto] backend Job Object'e eklenemedi");
        } else {
            println!("[resto] backend Job Object'e bağlandı (öksüz kalmayacak)");
        }
    }
}

/// Tepsiden "Çıkış" seçildiğinde, frontend onay verene kadar gerçek çıkışı
/// engellemek için kullanılır. `quit_app` komutu bunu true yapar.
struct CikisOnayi(Mutex<bool>);

// ============================================================
// Backend süreç yönetimi
// ============================================================

/// Backend'in çalışacağı klasörü ve kullanılacak node çalıştırılabilirini bulur.
///
/// Geliştirmede: proje kökü + PATH'teki node.
/// Üretimde: kaynaklara gömülen `backend/` klasörü + yanına paketlenen node.
fn backend_yollari(app: &AppHandle) -> (PathBuf, PathBuf) {
    // NOT: `#[cfg]` blokları yerine `cfg!(...)` kullanılıyor — her iki dal da
    // her yapılandırmada DERLENİR, böylece sürüm/hata ayıklama farkı derleme
    // hatasına yol açmaz.
    if cfg!(debug_assertions) {
        // src-tauri/../  => proje kökü (server.js burada)
        let kok = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        (kok, PathBuf::from("node"))
    } else {
        let kaynak = app
            .path()
            .resource_dir()
            .map(|p| p.join("backend"))
            .unwrap_or_else(|_| PathBuf::from("backend"));

        // Paketlenmiş node, uygulama exe'sinin yanındadır (externalBin).
        let node = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(PathBuf::from))
            .map(|dir| dir.join(if cfg!(windows) { "node.exe" } else { "node" }))
            .filter(|p| p.exists())
            .unwrap_or_else(|| PathBuf::from("node"));

        (kaynak, node)
    }
}

/// Kuruluma özel ayar dosyasının yolu: `%APPDATA%\com.resto.pos\ayarlar.env`
///
/// NEDEN BURADA: `.env` kasıtlı olarak PAKETE DAHİL EDİLMEZ (makineye özel
/// kimlik bilgileri içerir ve kurulum klasörü Program Files altında salt
/// okunurdur). Ayarlar kullanıcı veri klasöründe tutulur, backend'e ortam
/// değişkeni olarak geçilir. `dotenv` var olan ortam değişkenlerinin ÜZERİNE
/// YAZMAZ, dolayısıyla buradan gelen değerler geçerli olur.
fn ayar_dosyasi(app: &AppHandle) -> Option<PathBuf> {
    // %PROGRAMDATA%\RESTO POS tercih edilir çünkü:
    //   1) Kaldırma/yeniden kurulumdan ETKİLENMEZ. Uygulama kimliğine dayalı
    //      %APPDATA%\com.resto.pos klasörü kaldırıcı tarafından siliniyor ve
    //      her güncellemede veritabanı bilgileri kayboluyordu (yaşandı).
    //   2) Makinedeki tüm Windows kullanıcıları aynı ayarı görür — bir POS
    //      terminali için doğru davranış.
    let dizin = std::env::var_os("ProgramData")
        .map(PathBuf::from)
        .map(|p| p.join("RESTO POS"));

    let dizin = match dizin {
        Some(d) if std::fs::create_dir_all(&d).is_ok() => d,
        // ProgramData yoksa/yazılamıyorsa kullanıcı klasörüne düş.
        _ => {
            let yedek = app.path().app_config_dir().ok()?;
            let _ = std::fs::create_dir_all(&yedek);
            return Some(yedek.join("ayarlar.env"));
        }
    };

    let yeni = dizin.join("ayarlar.env");

    // Geriye dönük uyumluluk: eski kurulumlarda ayarlar %APPDATA% altındaydı.
    // Kullanıcı bilgilerini yeniden girmek zorunda kalmasın diye taşınır.
    if !yeni.exists() {
        if let Ok(eski_dizin) = app.path().app_config_dir() {
            let eski = eski_dizin.join("ayarlar.env");
            if eski.exists() && std::fs::copy(&eski, &yeni).is_ok() {
                println!("[resto] ayarlar yeni konuma taşındı: {}", yeni.display());
            }
        }
    }

    Some(yeni)
}

/// Kriptografik rastgele 32 baytlık hex anahtar (ilk kurulumda JWT_SECRET).
fn rastgele_anahtar() -> String {
    let mut bayt = [0u8; 32];
    match getrandom::fill(&mut bayt) {
        Ok(()) => bayt.iter().map(|b| format!("{b:02x}")).collect(),
        // RNG erişilemezse boş dön: aşağıdaki kod kullanıcıyı dosyayı elle
        // doldurmaya yönlendirir; ZAYIF bir anahtar üretmektense boş bırakılır.
        Err(_) => String::new(),
    }
}

/// Ayar dosyasını okur; yoksa varsayılanlarla oluşturur.
/// Dönen liste backend sürecine ortam değişkeni olarak verilir.
fn backend_ortami(app: &AppHandle) -> Vec<(String, String)> {
    let Some(yol) = ayar_dosyasi(app) else {
        return Vec::new();
    };

    if !yol.exists() {
        let sablon = format!(
            "# RESTO POS — kuruluma özel ayarlar\n\
             # Bu dosya ilk çalıştırmada oluşturuldu. Veritabanı bilgilerinizi girin\n\
             # ve uygulamayı yeniden başlatın.\n\
             DB_SERVER=localhost\n\
             DB_DATABASE=RestoranDB\n\
             DB_USER=sa\n\
             DB_PASSWORD=\n\
             DB_PORT=1433\n\
             PORT=4091\n\
             NODE_ENV=production\n\
             # Oturum anahtarı — otomatik üretildi, DEĞİŞTİRMEYİN.\n\
             JWT_SECRET={}\n",
            rastgele_anahtar()
        );
        if let Err(e) = std::fs::write(&yol, sablon) {
            eprintln!("[resto] ayar dosyası oluşturulamadı: {e}");
            return Vec::new();
        }
        println!("[resto] ayar dosyası oluşturuldu: {}", yol.display());
    }

    let Ok(icerik) = std::fs::read_to_string(&yol) else {
        return Vec::new();
    };

    icerik
        .lines()
        .map(str::trim)
        .filter(|s| !s.is_empty() && !s.starts_with('#'))
        .filter_map(|s| s.split_once('='))
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .filter(|(k, _)| !k.is_empty())
        .collect()
}

/// Express backend'ini alt süreç olarak başlatır.
fn backend_baslat(app: &AppHandle) -> Option<Child> {
    let (calisma_dizini, node) = backend_yollari(app);
    let sunucu = calisma_dizini.join("server.js");

    if !sunucu.exists() {
        eprintln!("[resto] server.js bulunamadı: {}", sunucu.display());
        return None;
    }

    let mut komut = Command::new(&node);
    komut
        .arg("server.js")
        .current_dir(&calisma_dizini)
        .env("NODE_ENV", "production");

    // Geliştirmede proje kökündeki .env zaten okunur; üretimde kullanıcı
    // ayar dosyasından gelen değerler ortam değişkeni olarak geçilir.
    if !cfg!(debug_assertions) {
        komut.envs(backend_ortami(app));

        // YAZILABİLİR KLASÖRLER — kritik.
        // Uygulama "C:\Program Files\RESTO POS" altına kurulur ve orası
        // standart kullanıcı için SALT OKUNURDUR. Backend açılışta logs/ ve
        // uploads/ oluşturmaya çalıştığında EPERM ile çöker. Bu yüzden veri
        // klasörleri kullanıcı veri dizinine yönlendirilir (bkz. utils/paths.js).
        if let Ok(veri) = app.path().app_local_data_dir() {
            for (degisken, alt_klasor) in [
                ("LOG_DIR", "logs"),
                ("UPLOAD_DIR", "uploads"),
                ("BACKUP_FS_DIR", "db-backups"),
            ] {
                let yol = veri.join(alt_klasor);
                if let Err(e) = std::fs::create_dir_all(&yol) {
                    eprintln!("[resto] {alt_klasor} klasörü oluşturulamadı: {e}");
                }
                komut.env(degisken, &yol);
            }
        }
    }

    // Windows'ta alt sürecin konsol penceresi açmasını engelle (CREATE_NO_WINDOW).
    #[cfg(windows)]
    komut.creation_flags(0x0800_0000);

    match komut.spawn() {
        Ok(child) => {
            println!("[resto] backend başlatıldı (pid {})", child.id());
            Some(child)
        }
        Err(hata) => {
            eprintln!("[resto] backend başlatılamadı: {hata}");
            None
        }
    }
}

/// Backend sürecini, doğurduğu alt süreçlerle birlikte durdurur.
///
/// Windows'ta `child.kill()` yalnızca doğrudan süreci öldürür; arkada kalan
/// alt süreçler portu tutmaya devam edip bir sonraki açılışı bozabilir.
/// Bu yüzden önce süreç AĞACI taskkill ile kapatılır.
fn backend_durdur(durum: &BackendSureci) {
    let mut kilit = match durum.0.lock() {
        Ok(k) => k,
        Err(zehirli) => zehirli.into_inner(),
    };

    let Some(mut child) = kilit.take() else {
        return;
    };

    let pid = child.id();
    println!("[resto] backend durduruluyor (pid {pid})");

    #[cfg(windows)]
    {
        // /T: süreç ağacı, /F: zorla. Bu çağrı başarısız olsa bile aşağıdaki
        // kill() yedek olarak devreye girer.
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(0x0800_0000)
            .output();
    }

    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(windows)]
use std::os::windows::process::CommandExt as _;

/// Backend portunun cevap verip vermediğini kontrol eder.
/// HTTP istemcisi eklemek yerine TCP bağlantısı denenir — bağımlılık yok, hızlı.
fn backend_hazir_mi() -> bool {
    let adres = SocketAddrV4::new(Ipv4Addr::LOCALHOST, BACKEND_PORT);
    TcpStream::connect_timeout(&adres.into(), Duration::from_millis(400)).is_ok()
}

// ============================================================
// Windows Servisi ile birlikte yaşama
//
// Sunucu kurulumu (installer/) backend'i 'RestoranBackend' adlı bir Windows
// Servisi olarak kaydeder. Uygulama açılışta 4091'i yoklar ve cevap varsa
// kendi kopyasını başlatmaz — normalde servis zaten ayakta olduğu için hep
// böyle olur.
//
// SORUN: Servis herhangi bir nedenle DURMUŞSA (elle durdurulmuş, çökmüş,
// güncelleme yarıda kalmış) uygulama sessizce KENDİ GÖMÜLÜ kopyasını
// başlatıyordu. O kopya uygulama derlendiği andaki sürümdür; sunucudaki
// backend daha yeni olabilir ve ikisi de AYNI veritabanına bağlanır — sessiz
// bir sürüm uyuşmazlığı.
//
// ÇÖZÜM: Servis KURULU ama cevap vermiyorsa, önce onu başlatmayı deneriz.
// Ancak bu başarısız olursa (yönetici hakkı yok, servis bozuk) gömülü kopyaya
// düşeriz ve hangi kaynağın kullanıldığını kaydederiz — panel bunu
// backend_bilgisi komutuyla okuyup kullanıcıyı uyarabilir.
// ============================================================

/// installer/servis-kur.ps1'in kaydettiği servis adı.
const SERVIS_ADI: &str = "RestoranBackend";

/// Hangi backend kullanılıyor: "servis" | "gomulu" | "bilinmiyor"
struct BackendKaynagi(Mutex<String>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendBilgisi {
    hazir: bool,
    kaynak: String,
    gomulu_surum: Option<String>,
    /// "RUNNING" | "STOPPED" | None (servis kurulu değil)
    servis_durumu: Option<String>,
}

/// Paketlenen backend kopyasının sürümü (masaustu-hazirla.mjs yazar).
fn gomulu_backend_surumu(app: &AppHandle) -> Option<String> {
    let (calisma_dizini, _) = backend_yollari(app);
    let icerik = std::fs::read_to_string(calisma_dizini.join("SURUM.json")).ok()?;
    let veri: serde_json::Value = serde_json::from_str(&icerik).ok()?;
    veri.get("surum")?.as_str().map(str::to_string)
}

/// Servisin durumunu `sc query` ile okur. None => servis kurulu değil.
#[cfg(windows)]
fn servis_durumu(ad: &str) -> Option<String> {
    use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

    let cikti = Command::new("sc.exe")
        .args(["query", ad])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;

    if !cikti.status.success() {
        return None; // 1060 = belirtilen servis mevcut değil
    }

    // `sc query` çıktısında "STATE : 4 RUNNING" gibi bir satır olur.
    let metin = String::from_utf8_lossy(&cikti.stdout);
    let satir = metin.lines().find(|s| s.contains("STATE"))?;
    for durum in ["RUNNING", "STOPPED", "START_PENDING", "STOP_PENDING", "PAUSED"] {
        if satir.contains(durum) {
            return Some(durum.to_string());
        }
    }
    Some("BILINMIYOR".to_string())
}

#[cfg(not(windows))]
fn servis_durumu(_ad: &str) -> Option<String> {
    None
}

/// Duran servisi başlatmayı dener ve portun açılmasını kısa süre bekler.
/// Yönetici hakkı yoksa sessizce başarısız olur — çağıran gömülü kopyaya düşer.
#[cfg(windows)]
fn servisi_baslatmayi_dene(ad: &str) -> bool {
    use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

    println!("[resto] '{ad}' servisi kurulu ama cevap vermiyor, başlatılmaya çalışılıyor...");

    let sonuc = Command::new("sc.exe")
        .args(["start", ad])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    if let Err(e) = sonuc {
        eprintln!("[resto] sc start çalıştırılamadı: {e}");
        return false;
    }

    // Servis başlarken backend'in DB'ye bağlanması da zaman alır.
    let baslangic = Instant::now();
    while baslangic.elapsed() < Duration::from_secs(20) {
        if backend_hazir_mi() {
            println!("[resto] servis ayağa kalktı, gömülü backend başlatılmayacak");
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    eprintln!("[resto] servis başlatılamadı (yönetici hakkı gerekebilir) — gömülü backend'e düşülüyor");
    false
}

#[cfg(not(windows))]
fn servisi_baslatmayi_dene(_ad: &str) -> bool {
    false
}

// ============================================================
// Testler
//
// servis_durumu() `sc.exe query` çıktısını METİN olarak ayrıştırır; bu kırılgan
// bir yaklaşımdır ve yanlış çalışırsa uygulama duran bir servisi "kurulu değil"
// sanıp sessizce gömülü backend'e düşer — düzeltmeye çalıştığımız hatanın ta
// kendisi. Bu yüzden gerçek Windows servislerine karşı doğrulanır.
//
// ÖNEMLİ BULGU: `sc query` alan adlarını (STATE/RUNNING/STOPPED) Türkçe
// Windows'ta da İNGİLİZCE basar; yalnızca hata metinleri yerelleşir. Var
// olmayan servis için çıkış kodu 1060'tır (success() false).
// ============================================================
#[cfg(all(test, windows))]
mod testler {
    use super::*;

    #[test]
    fn var_olmayan_servis_none_doner() {
        assert_eq!(servis_durumu("BoyleBirServisKesinlikleYok_XYZ"), None);
    }

    #[test]
    fn calisan_servis_running_doner() {
        // Her Windows kurulumunda bulunan, her zaman çalışan bir servis.
        assert_eq!(servis_durumu("Schedule"), Some("RUNNING".to_string()));
    }

    #[test]
    fn kurulu_servis_bir_durum_doner() {
        // Durumu ne olursa olsun (RUNNING/STOPPED), kurulu bir servis için
        // None DÖNMEMELİ — None "kurulu değil" anlamına gelir ve uygulamanın
        // servisi başlatmayı denemeden gömülü backend'e düşmesine yol açar.
        let durum = servis_durumu("EventLog");
        assert!(durum.is_some(), "kurulu servis için None döndü");
    }

    #[test]
    fn baslatilamayan_servis_false_doner() {
        // Var olmayan bir servis başlatılamaz; fonksiyon panik atmadan
        // false dönmeli (çağıran gömülü backend'e düşer).
        assert!(!servisi_baslatmayi_dene("BoyleBirServisKesinlikleYok_XYZ"));
    }
}

// ============================================================
// Pencere yardımcıları
// ============================================================

/// Ana pencereyi gösterir, öne alır ve tam ekran değilse büyütür.
fn ana_pencereyi_goster(app: &AppHandle) {
    if let Some(pencere) = app.get_webview_window("main") {
        let _ = pencere.show();
        let _ = pencere.unminimize();
        let _ = pencere.set_focus();
    }
}

/// Açılış ekranını kapatır ve ana pencereyi gösterir.
fn splash_kapat_ana_ac(app: &AppHandle) {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(pencere) = app.get_webview_window("main") {
        let _ = pencere.maximize();
        let _ = pencere.show();
        let _ = pencere.set_focus();
    }
}

// ============================================================
// Frontend'e açılan komutlar
//
// GÜVENLİK: Yalnızca bu özel komutlar erişilebilir. Kabuk (shell), dosya
// sistemi vb. eklenti izinleri VERİLMEZ (bkz. capabilities/default.json).
// ============================================================

/// Tam ekran aç/kapat (F11).
#[tauri::command]
fn tam_ekran_degistir(app: AppHandle) -> Result<bool, String> {
    let pencere = app
        .get_webview_window("main")
        .ok_or_else(|| "Ana pencere bulunamadı".to_string())?;
    let su_an = pencere.is_fullscreen().map_err(|e| e.to_string())?;
    pencere.set_fullscreen(!su_an).map_err(|e| e.to_string())?;
    Ok(!su_an)
}

/// Pencereyi kapatmak yerine sistem tepsisine gizler.
#[tauri::command]
fn tepsiye_gizle(app: AppHandle) -> Result<(), String> {
    if let Some(pencere) = app.get_webview_window("main") {
        pencere.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Frontend "aktif sipariş yok / kullanıcı onayladı" dediğinde çağrılır:
/// uygulamayı gerçekten kapatır.
#[tauri::command]
fn uygulamadan_cik(app: AppHandle) {
    if let Some(onay) = app.try_state::<CikisOnayi>() {
        if let Ok(mut k) = onay.0.lock() {
            *k = true;
        }
    }
    app.exit(0);
}

/// Backend'in ayakta olup olmadığını frontend'e bildirir (tanılama için).
#[tauri::command]
fn backend_durumu() -> bool {
    backend_hazir_mi()
}

/// Hangi backend'in kullanıldığını ve sürümünü frontend'e bildirir.
///
/// NEDEN: Uygulama, 4091 cevap vermiyorsa KENDİ gömülü backend kopyasını
/// başlatır. O kopya uygulama derlendiği andaki sürümdür; sunucuya ayrıca
/// kurulmuş olan backend daha yeni olabilir ve İKİSİ DE AYNI VERİTABANINA
/// bağlanır. Eskiden bu tamamen sessizdi. Artık panel durumu okuyup
/// kullanıcıyı uyarabilir.
#[tauri::command]
fn backend_bilgisi(app: AppHandle) -> BackendBilgisi {
    let kaynak = app
        .try_state::<BackendKaynagi>()
        .and_then(|d| d.0.lock().ok().map(|k| k.clone()))
        .unwrap_or_else(|| "bilinmiyor".to_string());

    BackendBilgisi {
        hazir: backend_hazir_mi(),
        kaynak,
        gomulu_surum: gomulu_backend_surumu(&app),
        servis_durumu: servis_durumu(SERVIS_ADI),
    }
}

// ============================================================
// Uygulama girişi
// ============================================================

fn main() {
    tauri::Builder::default()
        // Tek örnek: ikinci kez çalıştırılırsa var olan pencere öne getirilir.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            ana_pencereyi_goster(app);
        }))
        // Updater plugin'i BİLEREK kayıtlı değil: tauri.conf.json'daki
        // plugins.updater bloğu kaldırıldı (imzalama anahtarı kayıp, endpoint
        // zaten yer tutucuydu — bkz. SIFRELER-GIZLI.md). Plugin kayıtlıyken
        // config'i bulamayınca PluginInitialization hatasıyla TÜM uygulama
        // açılışta çöküyordu (0xc0000409) — bu yüzden burada da kaldırıldı.
        .manage(BackendSureci(Mutex::new(None)))
        .manage(BackendKaynagi(Mutex::new("bilinmiyor".to_string())))
        .manage(CikisOnayi(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            tam_ekran_degistir,
            tepsiye_gizle,
            uygulamadan_cik,
            backend_bilgisi,
            backend_durumu,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // ---------- 1) Backend'i başlat ----------
            // Zaten çalışan bir backend varsa (ör. geliştirici npm ile açtıysa)
            // ikinci bir kopya başlatılmaz.
            // Job Object önce kurulur: backend başlar başlamaz ona bağlanmalı.
            #[cfg(windows)]
            let is_nesnesi = is_nesnesi_olustur();

            // Sıra ÖNEMLİ (bkz. servisi_baslatmayi_dene yorumları):
            //   1) 4091 cevap veriyor mu?           -> ona bağlan
            //   2) Servis kurulu ama duruyor mu?    -> önce servisi başlatmayı dene
            //   3) Hiçbiri olmadıysa                -> gömülü kopyayı başlat
            // 2. adım olmadan, duran bir servis sessizce ESKİ gömülü backend'in
            // devreye girmesine yol açıyordu.
            let mut kaynak = "dis";

            if backend_hazir_mi() {
                // 4091'i dinleyen HER ZAMAN servis olmayabilir: geliştiricinin
                // elle başlattığı bir node, ya da önceki oturumdan kalmış öksüz
                // bir süreç de olabilir. Tanılama doğru olsun diye ayırt edilir.
                kaynak = match servis_durumu(SERVIS_ADI).as_deref() {
                    Some("RUNNING") => "servis",
                    _ => "dis",
                };
                println!("[resto] backend zaten çalışıyor ({kaynak}), yeni süreç başlatılmadı");
            } else {
                let servis = servis_durumu(SERVIS_ADI);
                let servis_kurulu = servis.is_some();
                if let Some(d) = &servis {
                    println!("[resto] '{SERVIS_ADI}' servis durumu: {d}");
                }

                if !(servis_kurulu && servisi_baslatmayi_dene(SERVIS_ADI)) {
                    kaynak = "gomulu";
                    if servis_kurulu {
                        eprintln!(
                            "[resto] UYARI: servis kurulu ama başlatılamadı; uygulamanın GÖMÜLÜ \
                             backend'i kullanılacak. Sunucudaki sürüm daha yeniyse uyuşmazlık olabilir."
                        );
                    }
                    if let Some(child) = backend_baslat(&handle) {
                        #[cfg(windows)]
                        if let Some(job) = &is_nesnesi {
                            is_nesnesine_ekle(job, &child);
                        }
                        if let Some(durum) = handle.try_state::<BackendSureci>() {
                            if let Ok(mut k) = durum.0.lock() {
                                *k = Some(child);
                            }
                        }
                    }
                }
            }

            if let Some(durum) = handle.try_state::<BackendKaynagi>() {
                if let Ok(mut k) = durum.0.lock() {
                    *k = kaynak.to_string();
                }
            }

            // Job Object handle'ı uygulama ömrü boyunca AÇIK kalmalı; kapanırsa
            // (yani uygulama sonlanırsa) çekirdek backend'i otomatik öldürür.
            #[cfg(windows)]
            if let Some(job) = is_nesnesi {
                app.manage(job);
            }

            // ---------- 2) Backend hazır olunca splash'ı kapat ----------
            // Ayrı iş parçacığında beklenir; arayüz donmaz.
            let bekleyen = handle.clone();
            std::thread::spawn(move || {
                let baslangic = Instant::now();
                loop {
                    if backend_hazir_mi() {
                        let _ = bekleyen.emit("resto://backend-hazir", true);
                        break;
                    }
                    if baslangic.elapsed() > BACKEND_HAZIR_TIMEOUT {
                        eprintln!("[resto] backend zaman aşımı — pencere yine de açılıyor");
                        let _ = bekleyen.emit("resto://backend-hazir", false);
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(250));
                }
                splash_kapat_ana_ac(&bekleyen);
            });

            // ---------- 3) Sistem tepsisi ----------
            let goster = MenuItem::with_id(app, "goster", "Göster", true, None::<&str>)?;
            let gizle = MenuItem::with_id(app, "gizle", "Tepsiye Gizle", true, None::<&str>)?;
            // X tuşu pencereyi yalnızca gizlediği için sayfa yeniden YÜKLENMEZ;
            // F5/Ctrl+R de bilerek kapalı. Backend uygulamadan sonra hazır
            // olduğunda kullanıcının elinde başka çare kalmıyordu.
            let yenile = MenuItem::with_id(app, "yenile", "Sayfayı Yeniden Yükle", true, None::<&str>)?;
            let ayrac = PredefinedMenuItem::separator(app)?;
            let cikis = MenuItem::with_id(app, "cikis", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&goster, &gizle, &yenile, &ayrac, &cikis])?;

            // `default_window_icon()` bazı ortamlarda (ör. pencereler henüz tam
            // hazır olmadan setup() çalıştığında) None dönebiliyordu — bu da
            // önceki `.expect("ikon yok")` ile PANİK'e (ve Windows'ta 0xc0000409
            // ile tüm uygulamanın sessizce çökmesine) yol açıyordu. Artık
            // pakete gömülü icon.png'den GARANTİLİ bir yedek yükleniyor.
            let tepsi_ikonu = app
                .default_window_icon()
                .cloned()
                .or_else(|| tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")).ok())
                .expect("ikon yüklenemedi (gömülü icon.png de okunamadı)");

            TrayIconBuilder::with_id("resto-tray")
                .icon(tepsi_ikonu)
                .tooltip("RESTO POS")
                .menu(&menu)
                // Sol tık menüyü açmasın; pencereyi geri getirsin.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "goster" => ana_pencereyi_goster(app),
                    "gizle" => {
                        if let Some(p) = app.get_webview_window("main") {
                            let _ = p.hide();
                        }
                    }
                    "yenile" => {
                        if let Some(p) = app.get_webview_window("main") {
                            let _ = p.show();
                            let _ = p.set_focus();
                            let _ = p.eval("window.location.reload()");
                        }
                    }
                    "cikis" => {
                        // Aktif sipariş kontrolü frontend'de yapılır (token orada).
                        // Pencere yoksa doğrudan çıkılır.
                        match app.get_webview_window("main") {
                            Some(pencere) => {
                                let _ = pencere.show();
                                let _ = pencere.set_focus();
                                let _ = app.emit("resto://cikis-istendi", ());
                            }
                            None => app.exit(0),
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Sol tıkta pencereyi geri getir (Windows'ta beklenen davranış).
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        ana_pencereyi_goster(tray.app_handle());
                    }
                })
                .build(app)?;

            // ---------- 3.5) Tanılama: geliştirici araçlarını aç ----------
            // SADECE `--features devtools` ile derlenirse çalışır; normal
            // üretim derlemesinde bu kod hiç yer almaz. Beyaz ekran gibi
            // arayüz hatalarında konsolu görebilmek için.
            #[cfg(feature = "devtools")]
            if let Some(pencere) = app.get_webview_window("main") {
                pencere.open_devtools();
            }

            // ---------- 4) Kapatma tuşu -> tepsiye gizle ----------
            // POS'ta yanlışlıkla kapatma veri kaybı riski taşır; X tuşu
            // uygulamayı kapatmaz, tepsiye indirir. Gerçek çıkış tepsi
            // menüsünden yapılır (ve aktif sipariş varsa onay istenir).
            if let Some(pencere) = app.get_webview_window("main") {
                let pencere_kopya = pencere.clone();
                pencere.on_window_event(move |olay| {
                    if let WindowEvent::CloseRequested { api, .. } = olay {
                        api.prevent_close();
                        let _ = pencere_kopya.hide();
                        let _ = pencere_kopya.emit("resto://tepsiye-gizlendi", ());
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("RESTO POS başlatılamadı")
        .run(|app_handle, event| {
            // Uygulama gerçekten kapanırken backend'i de durdur.
            if let RunEvent::Exit = event {
                if let Some(durum) = app_handle.try_state::<BackendSureci>() {
                    backend_durdur(&durum);
                }
            }
        });
}
