import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

// ============================================================
// RESTO POS — masaüstü (Tauri) köprüsü
//
// Sadece Tauri içinde çalışırken devreye girer; tarayıcıda açıldığında
// hiçbir şey yapmaz (web dağıtımı etkilenmez). Tauri modülleri dinamik
// import ile yüklenir, böylece web derlemesinde ayrı bir parçaya düşer.
//
// Görevleri:
//   1) Tepsiden "Çıkış" istendiğinde AKTİF SİPARİŞ kontrolü + onay penceresi
//   2) F11 ile tam ekran aç/kapat
//   3) Masaüstü uygulamasında anlamsız tarayıcı kısayollarını kapatmak
//
// İŞ MANTIĞINA DOKUNMAZ: yalnızca var olan GET /tables ucunu okur.
// ============================================================

const tauriMi = () =>
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

export default function DesktopBridge() {
    // null: sorulmuyor | number: onay bekleniyor (aktif sipariş sayısı)
    const [aktifSiparis, setAktifSiparis] = useState(null);
    const [kontrolEdiliyor, setKontrolEdiliyor] = useState(false);
    // Backend ayakta değilse gösterilecek hata ekranı
    const [backendYok, setBackendYok] = useState(false);
    const [yenidenDeneniyor, setYenidenDeneniyor] = useState(false);

    // Uygulamayı gerçekten kapatır (Rust tarafındaki komut).
    const cik = useCallback(async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('uygulamadan_cik');
    }, []);

    // ---------- Çıkış isteği: aktif sipariş varsa onay sor ----------
    useEffect(() => {
        if (!tauriMi()) return;

        let temizle = () => {};
        (async () => {
            const { listen } = await import('@tauri-apps/api/event');

            const birak = await listen('resto://cikis-istendi', async () => {
                setKontrolEdiliyor(true);
                try {
                    // Oturum yoksa API'yi hiç çağırma: 401 interceptor'ı
                    // kullanıcıyı login'e atar ve çıkış akışını bozar.
                    if (!localStorage.getItem('token')) {
                        await cik();
                        return;
                    }

                    const res = await client.get('/tables');
                    const acik = (res.data || []).filter((m) => m.ActiveOrderId != null).length;

                    if (acik > 0) {
                        setAktifSiparis(acik); // onay penceresini göster
                    } else {
                        await cik();
                    }
                } catch {
                    // Backend'e ulaşılamıyorsa çıkışı engelleme.
                    await cik();
                } finally {
                    setKontrolEdiliyor(false);
                }
            });

            temizle = birak;
        })();

        return () => temizle();
    }, [cik]);

    // ---------- Backend hazır mı? Değilse sessizce başarısız OLMA ----------
    // Rust, backend'i bekledikten sonra sonucu bildirir. Hazır değilse
    // kullanıcı eskiden yalnızca boş liste + konsol hatası görüyordu; artık
    // ne yapması gerektiğini söyleyen bir ekran gösteriyoruz.
    useEffect(() => {
        if (!tauriMi()) return;

        let temizle = () => {};
        (async () => {
            const { listen } = await import('@tauri-apps/api/event');
            const birak = await listen('resto://backend-hazir', (olay) => {
                setBackendYok(olay.payload === false);
            });
            temizle = birak;
        })();

        return () => temizle();
    }, []);

    // "Tekrar Dene": backend bu arada ayağa kalktıysa sayfayı yeniden yükler.
    const tekrarDene = useCallback(async () => {
        setYenidenDeneniyor(true);
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const hazir = await invoke('backend_durumu');
            if (hazir) {
                window.location.reload();
            } else {
                setYenidenDeneniyor(false);
            }
        } catch {
            setYenidenDeneniyor(false);
        }
    }, []);

    // ---------- Klavye: F11 tam ekran + gereksiz kısayolları kapat ----------
    useEffect(() => {
        if (!tauriMi()) return;

        const tusla = async (e) => {
            // F11 -> tam ekran aç/kapat
            if (e.key === 'F11') {
                e.preventDefault();
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('tam_ekran_degistir');
                return;
            }

            const ctrl = e.ctrlKey || e.metaKey;
            const tus = e.key.toLowerCase();

            // Tarayıcıya özgü, POS'ta anlamı olmayan / kazara veri kaybettirebilecek
            // kısayollar: yenile, yazdır, bul, kaynağı göster, geliştirici araçları.
            const engelli =
                e.key === 'F5' ||
                e.key === 'F12' ||
                (ctrl && ['r', 'p', 'f', 'g', 'u', 'j', 's', 'o'].includes(tus)) ||
                (ctrl && e.shiftKey && ['i', 'j', 'c', 'r'].includes(tus));

            if (engelli) e.preventDefault();
        };

        // Sağ tık menüsü ve metin sürükleme: masaüstü uygulamasında istenmez.
        const sagTik = (e) => e.preventDefault();
        const surukle = (e) => e.preventDefault();

        window.addEventListener('keydown', tusla, { capture: true });
        window.addEventListener('contextmenu', sagTik);
        window.addEventListener('dragstart', surukle);

        return () => {
            window.removeEventListener('keydown', tusla, { capture: true });
            window.removeEventListener('contextmenu', sagTik);
            window.removeEventListener('dragstart', surukle);
        };
    }, []);

    // Backend hazır olmadığında: her 5 saniyede bir sessizce tekrar dener.
    // Backend uygulamadan sonra ayağa kalkarsa kullanıcı hiçbir şey yapmadan
    // sayfa kendiliğinden yüklenir.
    useEffect(() => {
        if (!backendYok) return;
        const zamanlayici = setInterval(async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                if (await invoke('backend_durumu')) window.location.reload();
            } catch {
                /* backend hâlâ yok, denemeye devam */
            }
        }, 5000);
        return () => clearInterval(zamanlayici);
    }, [backendYok]);

    if (backendYok) {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink p-6">
                <div className="w-full max-w-lg rounded-2xl border border-hairline bg-panel p-7 shadow-2xl">
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ember mb-2">
                        Bağlantı Hatası
                    </p>
                    <h2 className="font-display text-xl font-bold text-paper mb-3">
                        Sunucu başlatılamadı
                    </h2>
                    <p className="text-sm text-slate leading-relaxed mb-4">
                        Uygulama kendi sunucusunu başlattı ancak veritabanına bağlanamadı.
                        En sık sebebi, ayar dosyasındaki veritabanı bilgilerinin yanlış
                        olmasıdır (özellikle yeniden kurulumdan sonra varsayılanlara döner).
                    </p>
                    <div className="rounded-lg border border-hairline bg-ink/40 p-3 mb-4">
                        <p className="font-mono text-[10px] uppercase tracking-wide text-slate/70 mb-1.5">
                            Ayar dosyası
                        </p>
                        <code className="font-mono text-xs text-paper break-all">
                            %APPDATA%\com.resto.pos\ayarlar.env
                        </code>
                    </div>
                    <p className="text-xs text-slate leading-relaxed mb-6">
                        Bu dosyadaki <span className="font-mono text-paper">DB_SERVER</span>,
                        {' '}<span className="font-mono text-paper">DB_DATABASE</span>,
                        {' '}<span className="font-mono text-paper">DB_USER</span> ve
                        {' '}<span className="font-mono text-paper">DB_PASSWORD</span> değerlerini
                        kontrol edin, ardından Tekrar Dene'ye basın. SQL Server'ın çalıştığından
                        da emin olun. (Arka planda her 5 saniyede bir otomatik denenir.)
                    </p>
                    <div className="flex justify-end">
                        <button
                            onClick={tekrarDene}
                            disabled={yenidenDeneniyor}
                            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 disabled:opacity-40 rounded-lg px-4 py-2.5 transition-colors"
                        >
                            {yenidenDeneniyor ? 'Deneniyor…' : '↻ Tekrar Dene'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (aktifSiparis == null) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/70 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-hairline bg-panel p-6 shadow-2xl">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ember mb-2">
                    Çıkış Onayı
                </p>
                <h2 className="font-display text-xl font-bold text-paper mb-3">
                    Açık masa/sipariş var
                </h2>
                <p className="text-sm text-slate leading-relaxed mb-6">
                    Şu anda <span className="font-mono font-bold text-paper">{aktifSiparis}</span> masada
                    ödenmemiş aktif sipariş bulunuyor. Uygulamayı şimdi kapatırsanız bu masalar açık
                    kalır ve kasa gün sonu işlemleri eksik kalabilir.
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => setAktifSiparis(null)}
                        className="font-mono text-xs uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-lg px-4 py-2.5 transition-colors"
                    >
                        Vazgeç
                    </button>
                    <button
                        onClick={cik}
                        disabled={kontrolEdiliyor}
                        className="font-mono text-xs uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 disabled:opacity-40 rounded-lg px-4 py-2.5 transition-colors"
                    >
                        Yine de Kapat
                    </button>
                </div>
            </div>
        </div>
    );
}
