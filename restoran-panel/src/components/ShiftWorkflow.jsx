import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useShift } from '../context/ShiftContext';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const fmtTime = (d) => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
const fmtDate = (d) => new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(d);

const KEYFRAMES = `
  @keyframes swFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes swPop { 0% { transform: translateY(12px) scale(.97); opacity: 0 } 100% { transform: translateY(0) scale(1); opacity: 1 } }
`;

// ============================================================
// AÇILIŞ GATE — vardiya açılmadan panele girilemez (kapatılamaz).
// ============================================================
export function OpenShiftModal() {
  const { user } = useAuth();
  const { openShift } = useShift();
  // Kasa miktarını sadece Admin girer — Mutfak/Kasa/Garson için vardiya
  // tek tıkla açılır, açılış kasası 0 kaydedilir.
  const canEnterAmount = user?.role === 'Admin';
  const [now, setNow] = useState(Date.now());
  const [openingFloat, setOpeningFloat] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const start = async () => {
    if (canEnterAmount && (openingFloat === '' || Number(openingFloat) < 0)) { setError('Açılış kasasını girin.'); return; }
    setBusy(true); setError('');
    try {
      await openShift(canEnterAmount ? Number(openingFloat) : 0, note.trim());
    } catch (err) {
      setError(err.response?.data?.error || 'Vardiya açılamadı.');
      setBusy(false);
    }
  };

  const d = new Date(now);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 bg-ink/70 backdrop-blur-md" style={{ animation: 'swFade .2s ease-out' }}>
      <style>{KEYFRAMES}</style>
      <div className="w-full max-w-md bg-panel rounded-2xl border border-hairline shadow-2xl overflow-hidden" style={{ animation: 'swPop .3s cubic-bezier(0.22,1,0.36,1)' }}>
        <div className="bg-ink text-cream px-6 py-5">
          <p className="font-mono text-[10px] tracking-[0.28em] text-ember uppercase mb-1">Vardiya Açılışı</p>
          <h2 className="font-display text-2xl font-bold leading-tight">Vardiyanı Başlat</h2>
          <p className="font-mono text-[11px] text-cream/50 mt-1">Devam etmek için önce vardiya açmalısın.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Kasiyer" value={user?.fullName || '—'} />
            <Info label="Vardiya No" value="Otomatik" />
            <Info label="Tarih" value={fmtDate(d)} className="col-span-2" />
            <Info label="Saat" value={<span className="tabular-nums">{fmtTime(d)}</span>} className="col-span-2" />
          </div>

          {canEnterAmount && (
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Açılış Kasası <span className="text-ember">*</span></label>
              <div className="flex items-center gap-2 bg-charcoal rounded-lg px-3 border border-hairline focus-within:border-ember">
                <span className="font-mono text-xl text-slate">₺</span>
                <input autoFocus type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0.00"
                  className="w-full bg-transparent border-0 py-3 font-mono text-3xl tabular-nums text-paper font-semibold focus:outline-none placeholder:text-slate/30" />
              </div>
            </div>
          )}

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Açılış Notu <span className="normal-case text-slate/60">(opsiyonel)</span></label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="ör. Kasada bozuk para var"
              className="w-full border border-hairline rounded-lg px-3 py-2 font-body text-sm text-paper bg-charcoal focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
          </div>

          {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>}

          <button onClick={start} disabled={busy}
            className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-moss hover:bg-moss/90 disabled:opacity-50 rounded-xl py-4 min-h-[3.25rem] transition-colors shadow-lg shadow-moss/20 active:translate-y-[1px]">
            {busy ? 'Açılıyor…' : '🟢 Vardiyayı Başlat'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, className = '' }) {
  return (
    <div className={`rounded-xl bg-charcoal border border-hairline px-3 py-2 ${className}`}>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate/70">{label}</p>
      <p className="font-mono text-sm text-paper truncate mt-0.5">{value}</p>
    </div>
  );
}

// ============================================================
// ÇIKIŞ İÇİN VARDİYA KAPATMA DİYALOGU
// onClosed: vardiya kapatıldıktan sonra çağrılır (çıkış yap).
// ============================================================
export function CloseShiftModal({ onCancel, onClosed }) {
  const { user } = useAuth();
  const { shift, closeShift } = useShift();
  const canEnterAmount = user?.role === 'Admin';
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const expected = Number(shift?.ExpectedCash) || 0;
  const diff = canEnterAmount && counted !== '' ? Number(counted) - expected : null;

  const confirm = async () => {
    if (canEnterAmount && (counted === '' || Number(counted) < 0)) { setError('Sayılan nakti girin.'); return; }
    setBusy(true); setError('');
    try {
      await closeShift(canEnterAmount ? Number(counted) : undefined, note.trim());
      onClosed?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Vardiya kapatılamadı.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-4 bg-ink/70 backdrop-blur-md" style={{ animation: 'swFade .2s ease-out' }} onClick={() => !busy && onCancel?.()}>
      <style>{KEYFRAMES}</style>
      <div className="w-full max-w-md bg-panel rounded-2xl border border-hairline shadow-2xl overflow-hidden" style={{ animation: 'swPop .3s cubic-bezier(0.22,1,0.36,1)' }} onClick={(e) => e.stopPropagation()}>
        <div className="bg-ink text-cream px-6 py-5">
          <p className="font-mono text-[10px] tracking-[0.28em] text-ember uppercase mb-1">Çıkış · Vardiya Kapanışı</p>
          <h2 className="font-display text-2xl font-bold leading-tight">Vardiyayı Kapat</h2>
          <p className="font-mono text-[11px] text-cream/50 mt-1">Vardiya kapatılmadan çıkış yapılamaz.</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {canEnterAmount && (
            <div className="rounded-xl bg-charcoal border border-hairline px-4 py-3 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate">Beklenen Nakit</span>
              <span className="font-mono text-xl font-bold tabular-nums text-paper">{money(expected)}</span>
            </div>
          )}

          {canEnterAmount && (
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Sayılan Nakit <span className="text-ember">*</span></label>
              <div className="flex items-center gap-2 bg-charcoal rounded-lg px-3 border border-hairline focus-within:border-ember">
                <span className="font-mono text-xl text-slate">₺</span>
                <input autoFocus type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00"
                  className="w-full bg-transparent border-0 py-3 font-mono text-2xl tabular-nums text-paper font-semibold focus:outline-none placeholder:text-slate/30" />
              </div>
            </div>
          )}

          {diff !== null && (
            <div className={`rounded-lg px-3 py-2.5 font-mono text-sm flex items-center justify-between ${
              Math.abs(diff) < 0.005 ? 'bg-moss/10 text-moss' : diff > 0 ? 'bg-azure/10 text-azure' : 'bg-red-500/10 text-red-500'
            }`}>
              <span className="uppercase text-[10px] tracking-wide">{diff > 0 ? 'Fazla' : diff < 0 ? 'Eksik' : 'Tam'}</span>
              <span className="font-semibold tabular-nums">{money(Math.abs(diff))}</span>
            </div>
          )}

          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Kapanış notu (opsiyonel)"
            className="w-full border border-hairline rounded-lg px-3 py-2 font-body text-sm text-paper bg-charcoal focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />

          {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => !busy && onCancel?.()} disabled={busy}
              className="font-mono text-xs uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl py-3.5 transition-colors disabled:opacity-50">
              Vazgeç
            </button>
            <button onClick={confirm} disabled={busy}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember hover:bg-ember/90 rounded-xl py-3.5 transition-colors disabled:opacity-50">
              {busy ? 'İşleniyor…' : 'Kapat & Çıkış'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
