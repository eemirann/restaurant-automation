import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

// Üç sütunlu tahta — "Yeni" ve "Hazırlanıyor" aynı sütunda toplanır (ikisi de
// "mutfağın elinde, henüz bitmedi" anlamına gelir), kart üzerindeki küçük
// rozet ikisini birbirinden ayırt eder.
const COLUMNS = [
  { key: 'preparing', title: 'Hazırlanıyor', icon: '🔥', statuses: ['New', 'Preparing'], accent: 'border-ember/40 bg-ember/5' },
  { key: 'ready', title: 'Hazır', icon: '✅', statuses: ['Ready'], accent: 'border-moss/40 bg-moss/5' },
  { key: 'served', title: 'Servis Edildi', icon: '🍽', statuses: ['Served'], accent: 'border-azure/40 bg-azure/5' },
];

// Bir kalemi bir sonraki duruma ilerleten TEK aksiyon — sütun başına 3 ayrı
// buton yerine (eski tasarım), kart başına net bir "sıradaki adım" butonu.
const NEXT_STATUS = { New: 'Preparing', Preparing: 'Ready', Ready: 'Served', Served: null };
const NEXT_LABEL = { New: '▶ Başla', Preparing: '✅ Hazır', Ready: '🍽 Servis Et' };

const fmtWait = (createdAt, now) => {
  if (!createdAt) return { text: '—', tone: 'text-slate' };
  const min = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  const text = min < 1 ? 'az önce' : min < 60 ? `${min} dk` : `${Math.floor(min / 60)} sa ${min % 60} dk`;
  const tone = min >= 15 ? 'text-red-500' : min >= 7 ? 'text-amber-500' : 'text-moss';
  return { text, tone };
};

export default function Kds() {
  const { user } = useAuth();
  // Garson mutfak ekranını SADECE görüntüleyebilir — kendi siparişinin
  // durumunu takip edebilsin diye erişimi var, ama durum değiştiremez
  // (backend de aynı kısıtı PATCH /kds/items/:id/status'ta uyguluyor).
  const isWaiter = user?.role === 'Waiter';

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busyId, setBusyId] = useState(null);

  // Üç sütun her zaman (Yeni/Hazırlanıyor/Hazır/Servis) birlikte gösterildiği
  // için artık "Hazır/Servis edilenleri de göster" anahtarına gerek yok —
  // her zaman status=all istenir.
  const fetchQueue = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const res = await client.get('/kds/queue', { params: { status: 'all' } });
      setQueue(res.data);
    } catch (err) {
      if (!silent) setError(err.response?.data?.error || 'Mutfak kuyruğu getirilemedi.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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

  const activeCount = queue.filter((q) => q.PrepStatus === 'New' || q.PrepStatus === 'Preparing').length;

  return (
    <div className="p-6 lg:p-8">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.3em] uppercase mb-1.5">Mutfak</p>
          <h1 className="text-3xl font-extrabold text-paper leading-none tracking-tight">Mutfak Ekranı (KDS)</h1>
          <p className="font-mono text-xs text-slate mt-2">
            {activeCount} bekleyen kalem{isWaiter ? ' · salt-okunur' : ''}
          </p>
        </div>
        <button
          onClick={() => fetchQueue()}
          title="Yenile"
          className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl px-3 py-2.5 bg-panel shadow-sm transition-colors"
        >
          ↻ Yenile
        </button>
      </div>

      {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-hairline bg-panel h-64 animate-pulse" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-2xl p-16 text-center bg-panel/50">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-slate font-mono text-sm">Bekleyen sipariş yok. Mutfak temiz!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {COLUMNS.map((col) => {
            const items = queue
              .filter((q) => col.statuses.includes(q.PrepStatus))
              .sort((a, b) => new Date(a.OrderCreatedAt || 0) - new Date(b.OrderCreatedAt || 0));
            return (
              <div key={col.key} className={`rounded-2xl border ${col.accent} p-3`}>
                {/* Sütun başlığı */}
                <div className="flex items-center justify-between px-1 pb-3 mb-1 border-b border-hairline/60">
                  <p className="font-display text-base font-bold text-paper flex items-center gap-1.5">
                    <span>{col.icon}</span> {col.title}
                  </p>
                  <span className="font-mono text-xs text-slate bg-panel border border-hairline rounded-full px-2 py-0.5 tabular-nums">
                    {items.length}
                  </span>
                </div>

                {/* Kartlar */}
                <div className="space-y-2.5">
                  {items.length === 0 ? (
                    <p className="font-mono text-[11px] text-slate/50 text-center py-6">—</p>
                  ) : (
                    items.map((item) => {
                      const wait = fmtWait(item.OrderCreatedAt, now);
                      const busy = busyId === item.OrderDetailsId;
                      const nextStatus = NEXT_STATUS[item.PrepStatus];
                      const isNew = item.PrepStatus === 'New';
                      return (
                        <div key={item.OrderDetailsId} className="rounded-xl border border-hairline bg-panel shadow-sm p-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="font-mono text-[10px] uppercase tracking-wide text-slate">
                              Masa {item.TableNumber ?? '—'} · #{item.OrderId}
                            </p>
                            <span className={`font-mono text-[10px] font-semibold ${wait.tone}`}>⏱ {wait.text}</span>
                          </div>
                          <p className="text-paper font-medium leading-snug">
                            <span className="font-mono text-[#FF6B6B] font-bold">{item.Quantity}×</span> {item.ProductName}
                          </p>
                          {item.Note && <p className="font-mono text-[11px] text-azure/90 mt-0.5">📝 {item.Note}</p>}
                          {isNew && (
                            <span className="inline-flex items-center gap-1 mt-1.5 border border-amber-500/40 bg-amber-500/10 text-amber-500 rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Henüz başlanmadı
                            </span>
                          )}

                          {!isWaiter && nextStatus && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setStatus(item, nextStatus)}
                              className="w-full mt-2.5 font-mono text-[11px] uppercase tracking-wide py-2 rounded-lg
                                         bg-[#FF6B6B] text-white hover:bg-[#ff5555] disabled:opacity-50 transition-colors"
                            >
                              {busy ? '…' : NEXT_LABEL[item.PrepStatus]}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
