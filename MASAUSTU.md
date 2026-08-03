# RESTO POS — Masaüstü Uygulaması (Tauri v2)

Bu belge, projeyi profesyonel bir Windows masaüstü uygulamasına dönüştüren
katmanı anlatır. **İş mantığı ve API yapısı değiştirilmemiştir**; Tauri yalnızca
var olan React panelini ve Express backend'ini saran bir kabuktur.

---

## Mimari

```
┌──────────────────────────────────────────────┐
│  RESTO POS.exe  (Tauri / Rust kabuk)         │
│                                              │
│  ┌────────────────┐   başlatır  ┌──────────┐ │
│  │ WebView2       │────────────▶│ node.exe │ │
│  │ React paneli   │             │ server.js│ │
│  │ (dist/)        │◀───────────▶│  :4091   │ │
│  └────────────────┘  HTTP/WS    └──────────┘ │
└──────────────────────────────────────────────┘
                                        │
                                        ▼
                                  SQL Server
```

- Panel `tauri://localhost` üzerinden servis edilir, backend'e `http://localhost:4091/api`
  adresinden bağlanır (panelin mevcut `VITE_API_URL` varsayılanı — değiştirilmedi).
- Backend, uygulama açılışında **alt süreç** olarak başlatılır, kapanışta durdurulur.
- Kurulan makinede **Node.js kurulu olması gerekmez**: `node.exe` uygulamayla paketlenir.

> **Ön koşul (değişmedi):** Backend hâlâ bir SQL Server örneğine ihtiyaç duyar
> (`.env` içindeki `DB_SERVER`). Tauri bunu değiştirmez.

---

## Eklenen Dosyalar

### `src-tauri/src/main.rs` — masaüstü kabuğunun çekirdeği
Tek sorumluluğu yaşam döngüsü yönetimi; hiçbir iş kuralı içermez.

| Bölüm | Ne yapar |
|---|---|
| `backend_baslat` | `server.js`'i alt süreç olarak açar. Windows'ta `CREATE_NO_WINDOW` (0x08000000) bayrağıyla — arkada siyah konsol penceresi **açılmaz**. |
| `backend_durdur` | Kapanışta backend'i durdurur. Önce `taskkill /T /F` ile **süreç ağacını** kapatır (yalnızca `kill()` alt süreçleri arkada bırakıp 4091 portunu kilitli tutabilirdi), sonra yedek olarak `kill()`. |
| `backend_hazir_mi` | 4091 portuna TCP bağlanmayı dener. HTTP istemcisi bağımlılığı eklemez — hafif ve hızlı. |
| `setup` → bekleme iş parçacığı | Backend hazır olana kadar (azami 60 sn) bekler, sonra splash'ı kapatıp ana pencereyi açar. Ayrı thread'de çalışır, **arayüz donmaz**. |
| Tepsi (tray) | Göster / Tepsiye Gizle / Çıkış menüsü. Sol tık pencereyi geri getirir. |
| `CloseRequested` | Pencerenin **X tuşu uygulamayı kapatmaz**, tepsiye gizler. POS'ta kazara kapatma veri kaybı riskidir. Gerçek çıkış tepsi menüsündedir. |
| `RunEvent::Exit` | Uygulama gerçekten kapanırken `backend_durdur` çağrılır. |

Frontend'e açılan komutlar: `tam_ekran_degistir`, `tepsiye_gizle`,
`uygulamadan_cik`, `backend_durumu`.

**Neden özel komutlar?** Tauri v2'de özel komutlar ayrıca izin gerektirmez.
Pencere/tepsi işlemlerini bu komutlarla yaparak frontend'e geniş çekirdek
yetkiler açmaktan kaçındık (bkz. `capabilities/default.json`).

### `src-tauri/tauri.conf.json` — uygulama tanımı
- **Kimlik:** `com.resto.pos`, ürün adı `RESTO POS`, sürüm `1.0.0`, yayıncı `RESTO`.
- **Ana pencere:** `maximized: true`, `minWidth/minHeight: 1280x720`,
  `visible: false` (splash kapanınca gösterilir), `dragDropEnabled: false`
  (panele dosya sürüklenmesi anlamsız).
- **Splash penceresi:** çerçevesiz, şeffaf, her zaman üstte, görev çubuğunda görünmez.
- **CSP:** `default-src 'self'` tabanlı; yalnızca `localhost:4091` (HTTP + WS)
  ve `ipc:` şemasına izin verir. `object-src 'none'`, `frame-ancestors 'none'`.
  `style-src` içindeki `'unsafe-inline'` **zorunludur** — Tailwind ve
  framer-motion çalışma anında satır içi stil enjekte eder.
- **Paketleme:** `msi` + `nsis` hedefleri, `perMachine` kurulum, Türkçe arayüz.
- **`createUpdaterArtifacts: true`** — güncelleyici için imzalı paket üretir.

### `src-tauri/capabilities/default.json` — izinler (güvenlik)
Yalnızca **üç** izin: `core:app:default`, `core:event:default`, `updater:default`.
Kabuk (shell), dosya sistemi, HTTP gibi eklenti izinleri **verilmedi**.
Splash penceresi bu yetenek listesinde yoktur — statik HTML olduğu için IPC'ye
hiç erişemez.

### `src-tauri/Cargo.toml`
`[profile.release]`: `opt-level="s"`, `lto=true`, `codegen-units=1`,
`panic="abort"`, `strip=true` — başlangıç hızı ve dosya boyutu için.
`devtools` özelliği **varsayılan olarak kapalı**: üretim derlemesinde
geliştirici araçları açılmaz.

### `restoran-panel/public/splash.html` — açılış ekranı
- Tek dosya, **sıfır dış kaynak** (font/görsel/script yok) → anında boyanır.
- Satır içi `<script>` **yok** — sıkı CSP (`script-src 'self'`) ile uyumlu;
  tüm animasyonlar saf CSS.
- Logo satır içi SVG olarak gömülü, `branding/resto-icon.svg` ile aynı tasarım.
- `prefers-reduced-motion` desteklenir.

### `restoran-panel/src/components/DesktopBridge.jsx` — masaüstü köprüsü
Tarayıcıda **hiçbir etkisi yoktur** (`__TAURI_INTERNALS__` kontrolü); web
dağıtımı aynen çalışmaya devam eder. Tauri modülleri `import()` ile dinamik
yüklenir → web derlemesinde ayrı bir parçaya düşer (ölçüldü: ~1 kB).

1. **Aktif sipariş onayı:** Tepsiden "Çıkış" seçildiğinde mevcut `GET /tables`
   ucunu okur, `ActiveOrderId != null` olan masaları sayar. Açık masa varsa
   onay penceresi gösterir. Backend'e ulaşılamazsa çıkışı **engellemez**.
   Oturum yoksa API'yi hiç çağırmaz (401 interceptor'ı çıkış akışını bozardı).
2. **F11** → tam ekran aç/kapat.
3. **Kısayol kapatma:** F5, F12, Ctrl+R/P/F/G/U/J/S/O, Ctrl+Shift+I/J/C,
   sağ tık menüsü ve metin sürükleme.

### `branding/resto-icon.svg` — tek kaynak (master) ikon
Koyu gri zemin + mavi fiş/adisyon sembolü. 16px'te okunabilmesi için tek güçlü
siluet kullanıldı. **Tüm ikonlar bu dosyadan üretilir** — başka yerde elle
düzenlenmiş ikon yoktur.

### `scripts/ikon-uret.mjs` — ikon üretim hattı
`npm run ikon`. SVG → 1024px PNG (sharp, yüksek `density` ile net rasterize)
→ Tauri CLI ile tüm platform boyutları (`.ico`, `.icns`, PNG'ler, Store logoları)
+ splash/hakkında logoları (128/256/512).

> Android/iOS ikonları üretildikten sonra **silinmiştir** (masaüstü uygulaması —
> kullanılmayan varlık bırakılmaz).

### `scripts/masaustu-hazirla.mjs` — paketleme ön hazırlığı
`tauri build` bunu `beforeBuildCommand` olarak çalıştırır:
1. React panelini derler.
2. Backend'i `src-tauri/backend-dist/`'e kopyalar ve orada
   `npm ci --omit=dev` çalıştırır → **jest/supertest/nodemon paketlenmez**.
   `tests/`, `uploads/`, `logs/`, `.env` bilerek **dışarıda bırakılır**
   (boyut + gizlilik).
3. `node.exe`'yi Tauri sidecar adlandırmasıyla (`node-<hedef-üçlüsü>.exe`) kopyalar.

> **Windows notu:** Node 20+ `.cmd` dosyalarını shell olmadan çalıştırmayı
> reddediyor (EINVAL). Bu yüzden `npm.cmd`/`npx.cmd` yerine `npm-cli.js` ve
> `tauri.js` doğrudan `node` ile çağrılıyor.

---

## Değiştirilen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `package.json` | `ikon`, `masaustu`, `masaustu:derle`, `tauri` script'leri; `@tauri-apps/cli` + `sharp` devDependency. |
| `restoran-panel/package.json` | `@tauri-apps/api` bağımlılığı. |
| `restoran-panel/src/App.jsx` | `<DesktopBridge />` eklendi (2 satır). Yönlendirme/iş mantığı **değişmedi**. |
| `.gitignore` | `src-tauri/target`, `backend-dist`, `binaries`, `gen`, `branding/dist` ve **`.secrets/`**. |

---

## Güncelleyici (Updater)

İmza anahtar çifti üretildi:

- **Açık anahtar** → `tauri.conf.json` içinde `plugins.updater.pubkey`
- **Özel anahtar** → `.secrets/resto-updater.key` — **gitignore'da, repoya girmez**

> ⚠️ Bu özel anahtarı **güvenli bir yerde yedekleyin**. Kaybolursa mevcut
> kurulumlara bir daha güncelleme yayınlayamazsınız.

`endpoints` şu an yer tutucudur (`https://resto.local/...`). Gerçek güncelleme
sunucunuzun adresiyle değiştirin. Derlerken imzalama için:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = ".secrets\resto-updater.key"
npm run masaustu:derle
```

---

## Komutlar

```powershell
npm run ikon             # SVG'den tüm ikonları yeniden üret
npm run masaustu         # geliştirme (hot reload)
npm run masaustu:derle   # MSI + NSIS kurulum paketi üret
```

Çıktılar: `src-tauri/target/release/bundle/msi/` ve `.../nsis/`

---

## Geliştirme Ortamı Ön Koşulları

- **Rust** (stable, MSVC) — `rustup`
- **Visual Studio Build Tools 2022** + "C++ build tools" iş yükü + Windows SDK
- **WebView2 Runtime** (Windows 11'de hazır gelir; kuruluma da gömülür)
