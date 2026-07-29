import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { getSocket } from '../api/socket';

const money = (n) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);
const clock = (v) => (v ? new Date(v).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const dur = (from, now) => {
  if (!from) return '—';
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}sa ${String(m).padStart(2, '0')}dk`;
};

export default function ActiveShifts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [forceClose, setForceClose] = useState(null); // shift
  const [transfer, setTransfer] = useState(null);      // shift
  const [users, setUsers] = useState([]);
  const [openFor, setOpenFor] = useState(null);        // user

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res = await client.get('/shifts/active');
      const base = Date.now();
      setRows(res.data.map((r) => ({
        ...r,
        startedAtClient: typeof r.ElapsedSeconds === 'number' ? base - r.ElapsedSeconds * 1000 : null,
      })));
    } catch (err) {
      if (!silent) setError(err.response?.data?.error || 'Aktif vardiyalar getirilemedi.');
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { load(); client.get('/users').then((r) => setUsers(r.data)).catch(() => {}); }, [load]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => {
    const s = getSocket(); if (!s) return undefined;
    const h = () => load({ silent: true });
    s.on('tables:changed', h); s.on('connect', h);
    return () => { s.off('tables:changed', h); s.off('connect', h); };
  }, [load]);

  const forceLogout = async (shift) => {
    if (!window.confirm(`${shift.UserName} kullanıcısının vardiyası zorla kapatılıp oturumu sonlandırılsın mı?`)) return;
    try { await client.post(`/shifts/${shift.ShiftId}/force-logout`); load({ silent: true }); }
    catch (err) { setError(err.response?.data?.error || 'İşlem başarısız.'); }
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1.5">Yönetici</p>
          <h1 className="font-display text-3xl font-bold text-paper leading-none">Aktif Vardiyalar</h1>
          <p className="font-mono text-xs text-slate mt-2">{rows.length} açık vardiya</p>
        </div>
        <button onClick={() => load()} className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-lg px-3 py-2.5 transition-colors">↻ Yenile</button>
      </div>

      {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>}

      {!loading && (() => {
        const openUserIds = new Set(rows.map((r) => r.UserId));
        const withoutShift = users.filter((u) => u.IsActive !== false && u.IsActive !== 0 && !openUserIds.has(u.UserId));
        if (withoutShift.length === 0) return null;
        return (
          <div className="border border-hairline rounded-2xl bg-panel/50 p-4 mb-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-3">Vardiyası Kapalı Personel — Onlar Adına Başlat</p>
            <div className="flex flex-wrap gap-2">
              {withoutShift.map((u) => (
                <button
                  key={u.UserId}
                  onClick={() => setOpenFor(u)}
                  className="font-mono text-[11px] uppercase tracking-wide px-3 py-2 rounded-lg border border-hairline text-slate hover:border-moss hover:text-moss transition-colors"
                >
                  🟢 {u.FullName} ({u.Role})
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {loading ? (
        <p className="text-slate font-mono text-sm animate-pulse">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-2xl p-12 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Şu an açık vardiya yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((s) => (
            <div key={s.ShiftId} className="rounded-2xl border border-hairline bg-panel p-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-moss animate-pulse" />
                    <h3 className="font-display text-lg font-semibold text-paper leading-none">{s.UserName}</h3>
                  </div>
                  <p className="font-mono text-[11px] text-slate mt-1">Vardiya #{s.ShiftId} · {s.UserRole} · başlangıç {clock(s.OpenedAt)}</p>
                </div>
                <span className="font-mono text-sm tabular-nums text-paper font-semibold">{dur(s.startedAtClient ?? s.OpenedAt, now)}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <Cell label="Sipariş" value={s.CurrentOrders ?? 0} />
                <Cell label="Ciro" value={money(s.CurrentSales)} />
                <Cell label="Beklenen Nakit" value={money(s.ExpectedCash)} tone="text-moss" />
                <Cell label="Açık Masa" value={s.CurrentTables ?? 0} />
                <Cell label="Açılış" value={money(s.OpeningFloat)} />
                <Cell label="Son Aktivite" value={s.LastActivity ? clock(s.LastActivity) : '—'} small />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setTransfer(s)} className="font-mono text-[10px] uppercase tracking-wide py-2 rounded-lg border border-hairline text-slate hover:border-azure hover:text-azure transition-colors">Devret</button>
                <button onClick={() => setForceClose(s)} className="font-mono text-[10px] uppercase tracking-wide py-2 rounded-lg border border-ember/40 text-ember hover:bg-ember/10 transition-colors">Zorla Kapat</button>
                <button onClick={() => forceLogout(s)} className="font-mono text-[10px] uppercase tracking-wide py-2 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 transition-colors">Zorla Çıkış</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {forceClose && (
        <ForceCloseModal shift={forceClose} onClose={() => setForceClose(null)} onDone={() => { setForceClose(null); load({ silent: true }); }} />
      )}
      {transfer && (
        <TransferModal shift={transfer} users={users} onClose={() => setTransfer(null)} onDone={() => { setTransfer(null); load({ silent: true }); }} />
      )}
      {openFor && (
        <OpenForModal user={openFor} onClose={() => setOpenFor(null)} onDone={() => { setOpenFor(null); load({ silent: true }); }} />
      )}
    </div>
  );
}

function Cell({ label, value, tone = 'text-paper', small }) {
  return (
    <div className="rounded-lg bg-charcoal border border-hairline px-2.5 py-1.5">
      <p className="font-mono text-[8px] uppercase tracking-wider text-slate/70">{label}</p>
      <p className={`font-mono ${small ? 'text-[11px]' : 'text-sm'} font-semibold tabular-nums mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 bg-ink/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-panel rounded-2xl border border-hairline shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-xl font-semibold text-paper mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ForceCloseModal({ shift, onClose, onDone }) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const expected = Number(shift.ExpectedCash) || 0;
  const diff = counted !== '' ? Number(counted) - expected : null;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await client.post(`/shifts/${shift.ShiftId}/force-close`, {
        CountedCash: counted !== '' ? Number(counted) : undefined,
        Note: note.trim() || undefined,
      });
      onDone();
    } catch (err) { setError(err.response?.data?.error || 'İşlem başarısız.'); setBusy(false); }
  };

  return (
    <Modal title={`Zorla Kapat · ${shift.UserName}`} onClose={onClose}>
      <div className="rounded-lg bg-charcoal border border-hairline px-3 py-2.5 mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase text-slate">Beklenen Nakit</span>
        <span className="font-mono text-lg font-bold text-paper tabular-nums">{money(expected)}</span>
      </div>
      <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Sayılan Nakit (opsiyonel)</label>
      <input type="number" min="0" step="0.01" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00"
        className="w-full border border-hairline rounded-lg px-3 py-2 font-mono text-sm text-paper bg-charcoal mb-2 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
      {diff !== null && (
        <p className={`font-mono text-xs mb-2 ${Math.abs(diff) < 0.005 ? 'text-moss' : 'text-red-500'}`}>Fark: {money(diff)}</p>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Not (opsiyonel)"
        className="w-full border border-hairline rounded-lg px-3 py-2 font-body text-sm text-paper bg-charcoal mb-3 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
      {error && <p className="text-ember text-sm mb-3">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} disabled={busy} className="font-mono text-xs uppercase text-slate border border-hairline rounded-lg py-2.5 disabled:opacity-50">Vazgeç</button>
        <button onClick={submit} disabled={busy} className="font-mono text-xs uppercase text-cream bg-ember hover:bg-ember/90 rounded-lg py-2.5 disabled:opacity-50">{busy ? '…' : 'Kapat'}</button>
      </div>
    </Modal>
  );
}

function OpenForModal({ user, onClose, onDone }) {
  const [openingFloat, setOpeningFloat] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (openingFloat === '' || Number(openingFloat) < 0) { setError('Açılış kasasını girin.'); return; }
    setBusy(true); setError('');
    try {
      await client.post('/shifts/open-for', {
        UserId: user.UserId,
        OpeningFloat: Number(openingFloat),
        OpeningNote: note.trim() || undefined,
      });
      onDone();
    } catch (err) { setError(err.response?.data?.error || 'Vardiya açılamadı.'); setBusy(false); }
  };

  return (
    <Modal title={`Vardiya Başlat · ${user.FullName}`} onClose={onClose}>
      <p className="font-mono text-[11px] text-slate mb-3">{user.FullName} ({user.Role}) adına vardiya açılacak.</p>
      <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Açılış Kasası</label>
      <input type="number" min="0" step="0.01" autoFocus value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0.00"
        className="w-full border border-hairline rounded-lg px-3 py-2 font-mono text-sm text-paper bg-charcoal mb-3 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
      <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Not (opsiyonel)</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        className="w-full border border-hairline rounded-lg px-3 py-2 font-body text-sm text-paper bg-charcoal mb-3 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
      {error && <p className="text-ember text-sm mb-3">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} disabled={busy} className="font-mono text-xs uppercase text-slate border border-hairline rounded-lg py-2.5 disabled:opacity-50">Vazgeç</button>
        <button onClick={submit} disabled={busy} className="font-mono text-xs uppercase text-cream bg-moss hover:bg-moss/90 rounded-lg py-2.5 disabled:opacity-50">{busy ? '…' : 'Başlat'}</button>
      </div>
    </Modal>
  );
}

function TransferModal({ shift, users, onClose, onDone }) {
  const [toUserId, setToUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const candidates = users.filter((u) => u.UserId !== shift.UserId && (u.IsActive === undefined || u.IsActive));

  const submit = async () => {
    if (!toUserId) { setError('Hedef kullanıcı seçin.'); return; }
    setBusy(true); setError('');
    try {
      await client.post(`/shifts/${shift.ShiftId}/transfer`, { ToUserId: Number(toUserId) });
      onDone();
    } catch (err) { setError(err.response?.data?.error || 'İşlem başarısız.'); setBusy(false); }
  };

  return (
    <Modal title={`Vardiyayı Devret · #${shift.ShiftId}`} onClose={onClose}>
      <p className="font-mono text-[11px] text-slate mb-3">{shift.UserName} kullanıcısının açık vardiyasını başka bir kullanıcıya devret.</p>
      <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Hedef Kullanıcı</label>
      <select value={toUserId} onChange={(e) => setToUserId(e.target.value)}
        className="w-full border border-hairline rounded-lg px-3 py-2 font-body text-sm text-paper bg-charcoal mb-3 focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember">
        <option value="">Seçin…</option>
        {candidates.map((u) => <option key={u.UserId} value={u.UserId}>{u.FullName} ({u.Role})</option>)}
      </select>
      {error && <p className="text-ember text-sm mb-3">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} disabled={busy} className="font-mono text-xs uppercase text-slate border border-hairline rounded-lg py-2.5 disabled:opacity-50">Vazgeç</button>
        <button onClick={submit} disabled={busy} className="font-mono text-xs uppercase text-cream bg-azure hover:bg-azure/90 rounded-lg py-2.5 disabled:opacity-50">{busy ? '…' : 'Devret'}</button>
      </div>
    </Modal>
  );
}
