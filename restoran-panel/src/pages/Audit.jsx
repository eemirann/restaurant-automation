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
  PRODUCT_86: { label: 'Tükendi', cls: 'border-ember/40 bg-ember/10 text-ember' },
  LOGIN: { label: 'Giriş', cls: 'border-moss/40 bg-moss/10 text-moss' },
  LOGOUT: { label: 'Çıkış', cls: 'border-slate/40 bg-slate/10 text-slate' },
  FORCED_CLOSE: { label: 'Zorla Kapatma', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  FORCED_LOGOUT: { label: 'Zorla Çıkış', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  SHIFT_TRANSFER: { label: 'Vardiya Devri', cls: 'border-azure/40 bg-azure/10 text-azure' },
  USER_CREATE: { label: 'Kullanıcı Oluştur', cls: 'border-moss/40 bg-moss/10 text-moss' },
  USER_ROLE_CHANGE: { label: 'Rol Değişimi', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  USER_DEACTIVATE: { label: 'Kullanıcı Pasife Alma', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  USER_REACTIVATE: { label: 'Kullanıcı Aktifleştirme', cls: 'border-moss/40 bg-moss/10 text-moss' },
  USER_PASSWORD_RESET: { label: 'Şifre Sıfırlama', cls: 'border-azure/40 bg-azure/10 text-azure' },
  USER_PIN_RESET: { label: 'PIN Sıfırlama', cls: 'border-azure/40 bg-azure/10 text-azure' },
  SETTINGS_UPDATE: { label: 'Ayar Güncelleme', cls: 'border-slate/40 bg-slate/10 text-slate' },
  INVOICE_PROVIDER_SETTINGS_UPDATE: { label: 'e-Fatura Ayarı', cls: 'border-slate/40 bg-slate/10 text-slate' },
  STOCK_ITEM_DELETE: { label: 'Stok Kalemi Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  STOCK_ITEM_REACTIVATE: { label: 'Stok Kalemi Aktifleştir', cls: 'border-moss/40 bg-moss/10 text-moss' },
  CAMPAIGN_CREATE: { label: 'Kampanya Oluştur', cls: 'border-moss/40 bg-moss/10 text-moss' },
  CAMPAIGN_DELETE: { label: 'Kampanya Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  CAMPAIGN_ACTIVITY_CHANGE: { label: 'Kampanya Aktiflik', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  CATEGORY_DELETE: { label: 'Kategori Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  EXTRA_DELETE: { label: 'Ekstra Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
  SYRUP_DELETE: { label: 'Şurup Sil', cls: 'border-red-500/40 bg-red-500/10 text-red-500' },
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
          <p className="font-mono text-xs text-slate mt-2">Hassas aksiyonlar: iptal, iade, indirim, transfer, tükendi, vardiya.</p>
        </div>
        {tab === 'audit' && (
          <button onClick={load} className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-lg px-3 py-2.5 transition-colors">↻ Yenile</button>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 mb-6 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`font-mono text-xs uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors ${
              tab === t.key ? 'border-ember text-paper font-semibold' : 'border-transparent text-slate hover:text-paper'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'audit' ? (
        <>
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
        <button onClick={load} className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-lg px-3 py-2.5 transition-colors">↻ Yenile</button>
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
