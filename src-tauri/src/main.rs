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
    let dizin = app.path().app_config_dir().ok()?;
    let _ = std::fs::create_dir_all(&dizin);
    Some(dizin.join("ayarlar.env"))
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

// ============================================================
// Uygulama girişi
// ============================================================

fn main() {
    tauri::Builder::default()
        // Tek örnek: ikinci kez çalıştırılırsa var olan pencere öne getirilir.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            ana_pencereyi_goster(app);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(BackendSureci(Mutex::new(None)))
        .manage(CikisOnayi(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            tam_ekran_degistir,
            tepsiye_gizle,
            uygulamadan_cik,
            backend_durumu,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // ---------- 1) Backend'i başlat ----------
            // Zaten çalışan bir backend varsa (ör. geliştirici npm ile açtıysa)
            // ikinci bir kopya başlatılmaz.
            if backend_hazir_mi() {
                println!("[resto] backend zaten çalışıyor, yeni süreç başlatılmadı");
            } else if let Some(child) = backend_baslat(&handle) {
                if let Some(durum) = handle.try_state::<BackendSureci>() {
                    if let Ok(mut k) = durum.0.lock() {
                        *k = Some(child);
                    }
                }
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
            let ayrac = PredefinedMenuItem::separator(app)?;
            let cikis = MenuItem::with_id(app, "cikis", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&goster, &gizle, &ayrac, &cikis])?;

            TrayIconBuilder::with_id("resto-tray")
                .icon(app.default_window_icon().cloned().expect("ikon yok"))
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
