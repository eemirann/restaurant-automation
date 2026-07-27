import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const dt = (v) => (v ? new Date(v).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

export default function Shifts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [openingFloat, setOpeningFloat] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [note, setNote] = useState('');
  const [lastClosed, setLastClosed] = useState(null);

  const [history, setHistory] = useState([]);

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
    try { const res = await client.get('/shifts'); setHistory(res.data); } catch { /* sessiz */ }
  }, [isAdmin]);

  useEffect(() => { loadCurrent(); loadHistory(); }, [loadCurrent, loadHistory]);

  const openShift = async () => {
    setBusy(true); setError('');
    try {
      await client.post('/shifts/open', { OpeningFloat: Number(openingFloat) || 0 });
      setOpeningFloat('');
      setLastClosed(null);
      await loadCurrent();
    } catch (err) {
      setError(err.response?.data?.error || 'Vardiya açılamadı.');
    } finally { setBusy(false); }
  };

  const closeShift = async () => {
    if (countedCash === '' || Number(countedCash) < 0) { setError('Sayılan nakit girin.'); return; }
    setBusy(true); setError('');
    try {
      const res = await client.post('/shifts/close', { CountedCash: Number(countedCash), Note: note.trim() || undefined });
      setLastClosed(res.data);
      setCountedCash(''); setNote('');
      await loadCurrent();
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Vardiya kapatılamadı.');
    } finally { setBusy(false); }
  };

  const expected = Number(shift?.ExpectedCash) || 0;
  const diffPreview = countedCash !== '' ? Number(countedCash) - expected : null;

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
            <p className="font-mono text-[10px] uppercase tracking-wider text-cream/40">Beklenen Nakit</p>
            <p className="font-mono text-4xl font-bold tabular-nums text-cream mt-1">{money(expected)}</p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div><p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">Açılış Kasası</p><p className="font-mono text-sm font-semibold mt-0.5">{money(shift.OpeningFloat)}</p></div>
              <div><p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">Açılış Zamanı</p><p className="font-mono text-sm font-semibold mt-0.5">{dt(shift.OpenedAt)}</p></div>
            </div>
            <p className="font-mono text-[10px] text-cream/40 mt-4">Beklenen = açılış kasası + bu vardiyada aldığın net nakit ödemeler.</p>
          </div>

          <div className="rounded-2xl border border-hairline bg-panel p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-4">Vardiyayı Kapat</p>
            <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Sayılan Nakit (kasadaki)</label>
            <div className="flex items-center gap-2 bg-charcoal rounded-lg px-3 border border-hairline focus-within:border-ember mb-3">
              <span className="font-mono text-lg text-slate">₺</span>
              <input type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} placeholder="0.00"
                className="w-full bg-transparent border-0 py-2.5 font-mono text-2xl tabular-nums text-paper focus:outline-none" />
            </div>
            {diffPreview !== null && (
              <div className={`rounded-lg px-3 py-2.5 mb-3 font-mono text-sm flex items-center justify-between ${
                Math.abs(diffPreview) < 0.005 ? 'bg-moss/10 text-moss' : diffPreview > 0 ? 'bg-azure/10 text-azure' : 'bg-red-500/10 text-red-500'
              }`}>
                <span className="uppercase text-[10px] tracking-wide">{diffPreview > 0 ? 'Fazla' : diffPreview < 0 ? 'Eksik' : 'Tam'}</span>
                <span className="font-semibold tabular-nums">{money(Math.abs(diffPreview))}</span>
              </div>
            )}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Not (opsiyonel)"
              className="w-full border border-hairline rounded-lg px-3 py-2 font-body text-sm text-paper bg-charcoal mb-3 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
            <button onClick={closeShift} disabled={busy}
              className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 disabled:opacity-40 rounded-xl py-3 min-h-[3rem] transition-colors">
              {busy ? 'İşleniyor…' : 'Vardiyayı Kapat'}
            </button>
          </div>
        </div>
      ) : (
        /* ---- Kapalı: yeni vardiya aç ---- */
        <div className="max-w-md">
          {lastClosed && (
            <div className="rounded-2xl border border-hairline bg-panel p-5 mb-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Son Vardiya Kapatıldı</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className="font-mono text-[9px] uppercase text-slate/70">Beklenen</p><p className="font-mono text-sm font-semibold text-paper">{money(lastClosed.ExpectedCash)}</p></div>
                <div><p className="font-mono text-[9px] uppercase text-slate/70">Sayılan</p><p className="font-mono text-sm font-semibold text-paper">{money(lastClosed.CountedCash)}</p></div>
                <div><p className="font-mono text-[9px] uppercase text-slate/70">Fark</p><p className={`font-mono text-sm font-semibold ${Math.abs(Number(lastClosed.Difference)) < 0.005 ? 'text-moss' : 'text-red-500'}`}>{money(lastClosed.Difference)}</p></div>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-hairline bg-panel p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-1">Vardiya Kapalı</p>
            <p className="text-slate text-sm mb-4">Kasayı sayarak yeni vardiya açın.</p>
            <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Açılış Kasası</label>
            <div className="flex items-center gap-2 bg-charcoal rounded-lg px-3 border border-hairline focus-within:border-ember mb-4">
              <span className="font-mono text-lg text-slate">₺</span>
              <input type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0.00"
                className="w-full bg-transparent border-0 py-2.5 font-mono text-2xl tabular-nums text-paper focus:outline-none" />
            </div>
            <button onClick={openShift} disabled={busy}
              className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-moss hover:bg-moss/90 disabled:opacity-40 rounded-xl py-3 min-h-[3rem] transition-colors">
              {busy ? 'Açılıyor…' : 'Vardiya Aç'}
            </button>
          </div>
        </div>
      )}

      {/* Geçmiş (Admin) */}
      {isAdmin && history.length > 0 && (
        <div className="mt-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-3">Vardiya Geçmişi</p>
          <div className="rounded-2xl border border-hairline overflow-hidden bg-panel overflow-x-auto">
            <table className="w-full text-sm min-w-[40rem]">
              <thead>
                <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-wide text-slate">
                  <th className="px-4 py-2.5">Kullanıcı</th>
                  <th className="px-4 py-2.5">Açılış</th>
                  <th className="px-4 py-2.5">Kapanış</th>
                  <th className="px-4 py-2.5 text-right">Açılış Kasası</th>
                  <th className="px-4 py-2.5 text-right">Beklenen</th>
                  <th className="px-4 py-2.5 text-right">Sayılan</th>
                  <th className="px-4 py-2.5 text-right">Fark</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.ShiftId} className="border-b border-hairline last:border-b-0">
                    <td className="px-4 py-2.5 text-paper">{s.UserName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate">{dt(s.OpenedAt)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate">{s.Status === 'Open' ? '— (açık)' : dt(s.ClosedAt)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-paper">{money(s.OpeningFloat)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-paper">{s.ExpectedCash == null ? '—' : money(s.ExpectedCash)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-paper">{s.CountedCash == null ? '—' : money(s.CountedCash)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono text-xs font-semibold ${s.Difference == null ? 'text-slate' : Math.abs(Number(s.Difference)) < 0.005 ? 'text-moss' : 'text-red-500'}`}>
                      {s.Difference == null ? '—' : money(s.Difference)}
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
