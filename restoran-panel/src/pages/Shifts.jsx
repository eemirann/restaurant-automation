import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const dt = (v) => (v ? new Date(v).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

// ActiveShifts.jsx'teki AYNI canlı süre deseni (now + dur(from, now)).
const dur = (from, now) => {
  if (!from) return '—';
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}sa ${String(m).padStart(2, '0')}dk`;
};

// dur()'a benzer ama dakika inputlu — Vardiya Geçmişi tablosundaki
// DurationMinutes (backend'de DATEDIFF(MINUTE, ...) ile hesaplanır) için.
const durFromMinutes = (minutes) => {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return `${String(h).padStart(2, '0')}sa ${String(m).padStart(2, '0')}dk`;
};

export default function Shifts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [history, setHistory] = useState([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(null); // ShiftId — sil/geri getir işlemi süren satır

  // ActiveShifts.jsx'teki AYNI canlı saat deseni — açık vardiya kartındaki
  // saniye saniye ilerleyen "Açık Süre" göstergesi için.
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/shifts/current');
      setShift(res.data.shift);
    } catch (err) {
      setError(err.response?.data?.error || 'Vardiya bilgisi getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await client.get('/shifts', { params: showDeleted ? { includeDeleted: '1' } : undefined });
      setHistory(res.data);
    } catch { /* sessiz */ }
  }, [isAdmin, showDeleted]);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const deleteHistoryShift = async (s) => {
    if (!window.confirm(`#${s.ShiftId} numaralı vardiya kaydı (${s.UserName}) silinsin mi? Bu işlem geri getirilebilir.`)) return;
    setHistoryBusy(s.ShiftId);
    try {
      await client.patch(`/shifts/${s.ShiftId}/delete`);
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Vardiya kaydı silinemedi.');
    } finally {
      setHistoryBusy(null);
    }
  };

  const restoreHistoryShift = async (s) => {
    setHistoryBusy(s.ShiftId);
    try {
      await client.patch(`/shifts/${s.ShiftId}/restore`);
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Vardiya kaydı geri getirilemedi.');
    } finally {
      setHistoryBusy(null);
    }
  };

  // Kullanıcı bazında gruplanmış toplam çalışma süresi — ekstra backend
  // sorgusu yok, mevcut history verisinden client-side hesaplanır.
  const userTotals = history.reduce((acc, s) => {
    const key = s.UserName || `#${s.UserId}`;
    acc[key] = (acc[key] || 0) + (s.DurationMinutes || 0);
    return acc;
  }, {});

  // NOT: Bu ekranda vardiya AÇMA/KAPATMA yoktur (bkz. context/ShiftContext.jsx).
  // Vardiya = oturum: girişte otomatik açılır, çıkışta otomatik kapanır.
  // Buradaki elle açma/kapatma formları kaldırıldı çünkü otomatik açılışla
  // çakışıyorlardı — kapatılan vardiya bir sonraki tazelemede kendiliğinden
  // geri açılıyordu. Kasa sayımıyla kapatma yetkisi YÖNETİCİDE (Aktif
  // Vardiya ekranı); personel için vardiya yalnızca mesai kaydıdır.
  const expected = Number(shift?.ExpectedCash) || 0;

  // ============================================================
  // AÇILIŞ KASASI ALANLARI SIFIRSA GİZLENİR.
  //
  // Vardiya girişte otomatik ve 0 açılış kasasıyla açıldığı için bu alan
  // normalde hep ₺0,00 gösterir — bilgi taşımayan bir sütun/kutu olur.
  // Ama HER ZAMAN 0 DEĞİLDİR: yönetici, Aktif Vardiya ekranındaki "Vardiya
  // Aç" (open-for) akışıyla personel adına gerçek bir açılış kasası
  // girebilir. O yüzden alan tamamen silinmiyor, yalnızca değer sıfırken
  // gizleniyor — yöneticinin girdiği tutar kaybolmaz.
  // ============================================================
  const hasFloat = Number(shift?.OpeningFloat) > 0;
  const historyHasFloat = history.some((s) => Number(s.OpeningFloat) > 0);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <p className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1.5">Kasa</p>
        <h1 className="font-display text-3xl font-bold text-paper leading-none">Vardiya Yönetimi</h1>
      </div>

      {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>}

      {loading ? (
        <p className="text-slate font-mono text-sm animate-pulse">Yükleniyor…</p>
      ) : shift ? (
        /* ---- Açık vardiya ---- */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl">
          <div className="rounded-2xl bg-ink text-cream p-6 shadow-lg shadow-ink/20">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/50">Açık Vardiya</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-moss"><span className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse" /> Açık</span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-cream/40">Beklenen Nakit</p>
                <p className="font-mono text-4xl font-bold tabular-nums text-cream mt-1">{money(expected)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">Açık Süre</p>
                <p className="font-mono text-lg font-semibold tabular-nums text-moss mt-0.5">{dur(shift.OpenedAt, now)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {hasFloat && (
                <div><p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">Açılış Kasası</p><p className="font-mono text-sm font-semibold mt-0.5">{money(shift.OpeningFloat)}</p></div>
              )}
              <div><p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">Açılış Zamanı</p><p className="font-mono text-sm font-semibold mt-0.5">{dt(shift.OpenedAt)}</p></div>
            </div>
            <p className="font-mono text-[10px] text-cream/40 mt-4">
              {hasFloat
                ? 'Beklenen = açılış kasası + bu vardiyada aldığın net nakit ödemeler.'
                : 'Beklenen = bu vardiyada aldığın net nakit ödemeler.'}
            </p>
          </div>

          <div className="rounded-2xl border border-hairline bg-panel p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-4">Vardiya Nasıl Kapanır?</p>
            <p className="text-slate text-sm leading-relaxed mb-4">
              Vardiyan <span className="text-paper font-medium">çıkış yaptığında otomatik olarak kapanır</span> —
              kasa sayımı sorulmaz. Bu kayıt yalnızca mesai takibi içindir.
            </p>
            <div className="rounded-lg bg-charcoal border border-hairline px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate mb-1">Kasa Sayımı</p>
              <p className="text-slate text-sm leading-relaxed">
                Kasa mutabakatı gerekiyorsa yönetici, <span className="text-paper">Aktif Vardiya</span> ekranından
                sayılan nakdi girerek vardiyanı kapatabilir.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ---- Açık vardiya yok ---- */
        <div className="max-w-md">
          <div className="rounded-2xl border border-hairline bg-panel p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-1">Açık Vardiya Yok</p>
            <p className="text-slate text-sm leading-relaxed">
              Vardiya <span className="text-paper font-medium">giriş yaptığında otomatik açılır</span>,
              çıkışta kapanır. Burada görünmüyorsa çıkış yapıp tekrar giriş yapmayı deneyin.
            </p>
          </div>
        </div>
      )}

      {/* Geçmiş (Admin) */}
      {isAdmin && history.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate">Vardiya Geçmişi</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="accent-ember w-3.5 h-3.5"
              />
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate">Silinenleri Göster</span>
            </label>
          </div>

          {/* Kullanıcı bazında toplam çalışma süresi — bu 100 kayıt içinden client-side hesaplanır */}
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(userTotals).map(([userName, minutes]) => (
              <div key={userName} className="rounded-lg border border-hairline bg-panel px-3 py-2 flex items-center gap-2">
                <span className="text-xs text-paper font-medium">{userName}</span>
                <span className="font-mono text-xs text-slate tabular-nums">{durFromMinutes(minutes)}</span>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-hairline overflow-hidden bg-panel overflow-x-auto">
            <table className="w-full text-sm min-w-[48rem]">
              <thead>
                <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-wide text-slate">
                  <th className="px-4 py-2.5">Kullanıcı</th>
                  <th className="px-4 py-2.5">Açılış</th>
                  <th className="px-4 py-2.5">Kapanış</th>
                  <th className="px-4 py-2.5">Süre</th>
                  {historyHasFloat && <th className="px-4 py-2.5 text-right">Açılış Kasası</th>}
                  <th className="px-4 py-2.5 text-right">Beklenen</th>
                  <th className="px-4 py-2.5 text-right">Sayılan</th>
                  <th className="px-4 py-2.5 text-right">Fark</th>
                  <th className="px-4 py-2.5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.ShiftId} className={`border-b border-hairline last:border-b-0 ${s.IsDeleted ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 text-paper">{s.UserName}{s.IsDeleted ? <span className="ml-2 font-mono text-[9px] uppercase text-red-500">Silindi</span> : null}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate">{dt(s.OpenedAt)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate">{s.Status === 'Open' ? '— (açık)' : dt(s.ClosedAt)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-paper">{durFromMinutes(s.DurationMinutes)}</td>
                    {historyHasFloat && <td className="px-4 py-2.5 text-right font-mono text-xs text-paper">{money(s.OpeningFloat)}</td>}
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-paper">{s.ExpectedCash == null ? '—' : money(s.ExpectedCash)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-paper">{s.CountedCash == null ? '—' : money(s.CountedCash)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${s.Difference == null ? 'text-slate' : Math.abs(Number(s.Difference)) < 0.005 ? 'text-moss' : 'text-red-500'}`}>
                      {s.Difference == null ? '—' : money(s.Difference)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {s.IsDeleted ? (
                        <button
                          onClick={() => restoreHistoryShift(s)}
                          disabled={historyBusy === s.ShiftId}
                          className="font-mono text-[10px] uppercase tracking-wide text-moss hover:text-moss/80 border border-moss/40 rounded-sm px-2 py-1 transition-colors disabled:opacity-40"
                        >
                          Geri Getir
                        </button>
                      ) : (
                        <button
                          onClick={() => deleteHistoryShift(s)}
                          disabled={historyBusy === s.ShiftId}
                          className="font-mono text-[10px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2 py-1 transition-colors disabled:opacity-40"
                        >
                          Sil
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
