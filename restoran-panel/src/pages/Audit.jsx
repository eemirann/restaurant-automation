import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const ACTIONS = {
  ORDER_CANCEL: { label: 'Sipariş İptal', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  PAYMENT_REFUND: { label: 'İade', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  PAYMENT_DELETE: { label: 'Ödeme Silme', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  DISCOUNT_APPLIED: { label: 'İndirim', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  TABLE_TRANSFER: { label: 'Masa Transfer', cls: 'border-azure/40 bg-azure/10 text-azure' },
  SHIFT_OPEN: { label: 'Vardiya Açıldı', cls: 'border-moss/40 bg-moss/10 text-moss' },
  SHIFT_CLOSE: { label: 'Vardiya Kapandı', cls: 'border-slate/40 bg-slate/10 text-slate' },
  PRODUCT_86: { label: '86 / Tükendi', cls: 'border-ember/40 bg-ember/10 text-ember' },
};

const dt = (v) => (v ? new Date(v).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const fmtDetails = (d) => {
  if (!d) return '';
  try {
    const o = typeof d === 'string' ? JSON.parse(d) : d;
    return Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(' · ');
  } catch {
    return String(d);
  }
};

export default function Audit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/audit');
      setRows(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Denetim günlüğü getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = actionFilter ? rows.filter((r) => r.Action === actionFilter) : rows;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1.5">Güvenlik</p>
          <h1 className="font-display text-3xl font-bold text-paper leading-none">Denetim Günlüğü</h1>
          <p className="font-mono text-xs text-slate mt-2">Hassas aksiyonlar: iptal, iade, indirim, transfer, 86, vardiya.</p>
        </div>
        <button onClick={load} className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-lg px-3 py-2.5 transition-colors">↻ Yenile</button>
      </div>

      {/* Aksiyon filtresi */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        <button onClick={() => setActionFilter('')} className={`font-mono text-xs uppercase tracking-wide px-3 py-1.5 rounded-lg border transition-all ${!actionFilter ? 'border-ember bg-ember/10 text-ember font-semibold' : 'border-hairline text-slate hover:text-paper'}`}>Tümü</button>
        {Object.entries(ACTIONS).map(([k, a]) => (
          <button key={k} onClick={() => setActionFilter(k)} className={`font-mono text-xs uppercase tracking-wide px-3 py-1.5 rounded-lg border transition-all ${actionFilter === k ? 'border-ember bg-ember/10 text-ember font-semibold' : 'border-hairline text-slate hover:text-paper'}`}>{a.label}</button>
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
    </div>
  );
}
