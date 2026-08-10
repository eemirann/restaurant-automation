import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { ACTIONS, dt, fmtDetails } from '../utils/auditLabels';

const TABS = [
  { key: 'audit', label: 'Denetim Günlüğü' },
  { key: 'logs', label: 'Teknik Loglar' },
];

export default function Audit() {
  const [tab, setTab] = useState('audit');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;
      const res = await client.get('/audit', { params });
      setRows(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Denetim günlüğü getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const visible = actionFilter ? rows.filter((r) => r.Action === actionFilter) : rows;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.3em] uppercase mb-1.5">Güvenlik</p>
          <h1 className="text-3xl font-extrabold text-paper leading-none tracking-tight">Denetim Günlüğü</h1>
          <p className="font-mono text-xs text-slate mt-2">Hassas aksiyonlar: iptal, iade, indirim, transfer, tükendi, vardiya.</p>
        </div>
        {tab === 'audit' && (
          <button onClick={load} className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl px-3 py-2.5 bg-panel shadow-sm transition-colors">↻ Yenile</button>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 mb-6 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs font-bold uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors ${
              tab === t.key ? 'border-[#FF6B6B] text-[#FF6B6B]' : 'border-transparent text-slate hover:text-paper'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'audit' ? (
        <>
          {/* Tarih aralığı filtresi — verilmezse son 200 kayıt (bkz. backend) */}
          <div className="flex flex-wrap items-end gap-3 mb-5">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wide text-slate/70 mb-1">Başlangıç</label>
              <input
                type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="border border-hairline rounded-lg px-3 py-2 font-mono text-xs text-paper bg-charcoal
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-wide text-slate/70 mb-1">Bitiş</label>
              <input
                type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="border border-hairline rounded-lg px-3 py-2 font-mono text-xs text-paper bg-charcoal
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            {(fromDate || toDate) && (
              <button
                onClick={() => { setFromDate(''); setToDate(''); }}
                className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl px-3 py-2.5 bg-panel shadow-sm transition-colors"
              >
                Temizle
              </button>
            )}
            {!fromDate && !toDate && (
              <p className="font-mono text-[10px] text-slate mb-2.5">Tarih seçilmezse son 200 kayıt gösterilir.</p>
            )}
          </div>

          {/* Aksiyon filtresi */}
          <div className="flex gap-1.5 mb-5 flex-wrap">
            <button onClick={() => setActionFilter('')} className={`text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border transition-all ${!actionFilter ? 'border-[#FF6B6B] bg-[#FF6B6B]/10 text-[#FF6B6B]' : 'border-hairline text-slate hover:text-paper'}`}>Tümü</button>
            {Object.entries(ACTIONS).map(([k, a]) => (
              <button key={k} onClick={() => setActionFilter(k)} className={`text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border transition-all ${actionFilter === k ? 'border-[#FF6B6B] bg-[#FF6B6B]/10 text-[#FF6B6B]' : 'border-hairline text-slate hover:text-paper'}`}>{a.label}</button>
            ))}
          </div>

          {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>}

          {loading ? (
            <p className="text-slate font-mono text-sm animate-pulse">Yükleniyor…</p>
          ) : visible.length === 0 ? (
            <div className="border border-dashed border-hairline rounded-2xl p-12 text-center bg-panel/50">
              <p className="text-slate font-mono text-sm">Kayıt yok.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-hairline overflow-hidden bg-panel overflow-x-auto">
              <table className="w-full text-sm min-w-[48rem]">
                <thead>
                  <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-wide text-slate">
                    <th className="px-4 py-2.5 w-36">Zaman</th>
                    <th className="px-4 py-2.5 w-40">Aksiyon</th>
                    <th className="px-4 py-2.5 w-32">Kullanıcı</th>
                    <th className="px-4 py-2.5 w-28">Nesne</th>
                    <th className="px-4 py-2.5">Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const a = ACTIONS[r.Action] || { label: r.Action, cls: 'border-hairline text-slate' };
                    return (
                      <tr key={r.AuditLogId} className="border-b border-hairline last:border-b-0">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate">{dt(r.CreatedAt)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center border rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${a.cls}`}>{a.label}</span>
                        </td>
                        <td className="px-4 py-2.5 text-paper">{r.UserName || (r.UserId ? `#${r.UserId}` : '—')}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate">{r.EntityType}{r.EntityId ? ` #${r.EntityId}` : ''}</td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate">{fmtDetails(r.Details)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <TechnicalLogs />
      )}
    </div>
  );
}

// ============================================================
// TEKNİK LOGLAR — GET /api/logs/recent (bkz. controllers/logsController.js,
// utils/logger.js). Yakalanmayan hatalar + process-level uncaughtException/
// unhandledRejection buradan okunur. Aynı sayfa, ayrı bir sekme (ayrı route yok).
// ============================================================
function TechnicalLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/logs/recent');
      setLogs(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Teknik loglar getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="font-mono text-xs text-slate">Yakalanmayan sunucu hataları — en yeni önce.</p>
        <button onClick={load} className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl px-3 py-2.5 bg-panel shadow-sm transition-colors">↻ Yenile</button>
      </div>

      {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>}

      {loading ? (
        <p className="text-slate font-mono text-sm animate-pulse">Yükleniyor…</p>
      ) : logs.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-2xl p-12 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Teknik hata kaydı yok.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map((l, i) => (
            <div key={i} className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-mono text-[10px] uppercase tracking-wide text-red-500">{l.level || 'error'}</span>
                <span className="font-mono text-[10px] text-slate">{dt(l.timestamp)}</span>
              </div>
              <p className="text-sm text-paper">{l.message}</p>
              {l.path && (
                <p className="font-mono text-[11px] text-slate mt-1">{l.method} {l.path}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
