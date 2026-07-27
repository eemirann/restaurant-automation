import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { getSocket } from '../api/socket';

// Kalem hazırlanma durumları (backend CHECK ile aynı).
const PREP = {
  New: { label: 'Yeni', pill: 'bg-amber-500/15 text-amber-500 border-amber-500/40', dot: 'bg-amber-500' },
  Preparing: { label: 'Hazırlanıyor', pill: 'bg-ember/15 text-ember border-ember/40', dot: 'bg-ember' },
  Ready: { label: 'Hazır', pill: 'bg-moss/15 text-moss border-moss/40', dot: 'bg-moss' },
  Served: { label: 'Servis', pill: 'bg-azure/15 text-azure border-azure/40', dot: 'bg-azure' },
};

const fmtWait = (createdAt, now) => {
  if (!createdAt) return { text: '—', tone: 'text-slate' };
  const min = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const text = min < 1 ? 'az önce' : min < 60 ? `${min} dk` : `${Math.floor(min / 60)} sa ${min % 60} dk`;
  const tone = min >= 15 ? 'text-red-500' : min >= 7 ? 'text-amber-500' : 'text-moss';
  return { text, tone };
};

export default function Kds() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReady, setShowReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState(null);

  const fetchQueue = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res = await client.get('/kds/queue', { params: showReady ? { status: 'all' } : {} });
      setQueue(res.data);
    } catch (err) {
      if (!silent) setError(err.response?.data?.error || 'Mutfak kuyruğu getirilemedi.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showReady]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Saat tiki (bekleme süreleri için)
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(i);
  }, []);

  // Gerçek zamanlı: yeni kalem / durum değişimi
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const refresh = () => fetchQueue({ silent: true });
    socket.on('kds:new', refresh);
    socket.on('kds:updated', refresh);
    socket.on('tables:changed', refresh);
    socket.on('connect', refresh);
    return () => {
      socket.off('kds:new', refresh);
      socket.off('kds:updated', refresh);
      socket.off('tables:changed', refresh);
      socket.off('connect', refresh);
    };
  }, [fetchQueue]);

  const setStatus = async (item, prepStatus) => {
    setBusyId(item.OrderDetailsId);
    // Optimistik güncelleme
    setQueue((prev) => prev.map((q) => q.OrderDetailsId === item.OrderDetailsId ? { ...q, PrepStatus: prepStatus } : q));
    try {
      await client.patch(`/kds/items/${item.OrderDetailsId}/status`, { PrepStatus: prepStatus });
      // Kuyruktan düşmesi/teyit için sessiz tazele
      fetchQueue({ silent: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Durum güncellenemedi.');
      fetchQueue({ silent: true });
    } finally {
      setBusyId(null);
    }
  };

  // Siparişe göre grupla (mutfak "adisyonu")
  const tickets = Object.values(
    queue.reduce((acc, item) => {
      const k = item.OrderId;
      if (!acc[k]) acc[k] = { orderId: item.OrderId, tableNumber: item.TableNumber, createdAt: item.OrderCreatedAt, items: [] };
      acc[k].items.push(item);
      return acc;
    }, {})
  ).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  const activeCount = queue.filter((q) => q.PrepStatus === 'New' || q.PrepStatus === 'Preparing').length;

  return (
    <div className="p-6 lg:p-8">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-ember uppercase mb-1.5">Mutfak</p>
          <h1 className="font-display text-3xl font-bold text-paper leading-none">Mutfak Ekranı (KDS)</h1>
          <p className="font-mono text-xs text-slate mt-2">{activeCount} bekleyen kalem · {tickets.length} adisyon</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReady((v) => !v)}
            className={`font-mono text-xs uppercase tracking-wide px-3.5 py-2.5 rounded-lg border transition-colors ${
              showReady ? 'border-moss bg-moss/10 text-moss font-semibold' : 'border-hairline text-slate hover:text-paper'
            }`}
          >
            Hazır olanları göster
          </button>
          <button
            onClick={() => fetchQueue()}
            title="Yenile"
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-lg px-3 py-2.5 transition-colors"
          >
            ↻
          </button>
        </div>
      </div>

      {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-hairline bg-panel h-48 animate-pulse" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-2xl p-16 text-center bg-panel/50">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-slate font-mono text-sm">Bekleyen sipariş yok. Mutfak temiz!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tickets.map((ticket) => {
            const wait = fmtWait(ticket.createdAt, now);
            return (
              <div key={ticket.orderId} className="rounded-2xl border border-hairline bg-panel shadow-sm overflow-hidden flex flex-col">
                {/* Adisyon başlığı */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-ink text-cream">
                  <div>
                    <p className="font-display text-lg font-bold leading-none">Masa {ticket.tableNumber ?? '—'}</p>
                    <p className="font-mono text-[10px] text-cream/60 mt-0.5">Sipariş #{ticket.orderId}</p>
                  </div>
                  <span className={`font-mono text-sm font-semibold ${wait.tone}`}>⏱ {wait.text}</span>
                </div>

                {/* Kalemler */}
                <div className="divide-y divide-hairline">
                  {ticket.items.map((item) => {
                    const cfg = PREP[item.PrepStatus] || PREP.New;
                    const busy = busyId === item.OrderDetailsId;
                    return (
                      <div key={item.OrderDetailsId} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-paper font-medium">
                              <span className="font-mono text-ember font-bold">{item.Quantity}×</span> {item.ProductName}
                            </p>
                            {item.Note && <p className="font-mono text-[11px] text-azure/90 mt-0.5">📝 {item.Note}</p>}
                          </div>
                          <span className={`shrink-0 inline-flex items-center gap-1.5 border rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide ${cfg.pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
                          </span>
                        </div>

                        {/* Durum ilerlet butonları */}
                        <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                          {['Preparing', 'Ready', 'Served'].map((st) => {
                            const active = item.PrepStatus === st;
                            const c = PREP[st];
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={busy || active}
                                onClick={() => setStatus(item, st)}
                                className={`font-mono text-[10px] uppercase tracking-wide py-2 rounded-lg border transition-all disabled:opacity-50 ${
                                  active ? `${c.pill} font-semibold` : 'border-hairline text-slate hover:border-ember hover:text-ember'
                                }`}
                              >
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
