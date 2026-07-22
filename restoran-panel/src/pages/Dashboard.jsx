import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
};

const STATUS_CONFIG = {
  Pending: { label: 'Bekliyor', dot: 'bg-amber-500', border: 'border-amber-300', bg: 'bg-amber-50' },
  Served: { label: 'Servis Edildi', dot: 'bg-moss', border: 'border-moss/40', bg: 'bg-moss/5' },
  Paid: { label: 'Ödendi', dot: 'bg-emerald-600', border: 'border-emerald-300', bg: 'bg-emerald-50' },
  Cancelled: { label: 'İptal Edildi', dot: 'bg-slate', border: 'border-slate/30', bg: 'bg-slate/5' },
  Merged: { label: 'Birleştirildi', dot: 'bg-ink/50', border: 'border-ink/20', bg: 'bg-ink/5' },
};

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const isToday = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

export default function Dashboard() {
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  const [orders, setOrders] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersRes, tablesRes] = await Promise.all([
        client.get('/orders'),
        client.get('/tables'),
      ]);
      setOrders(ordersRes.data);
      setTables(tablesRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Özet verileri getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Özet hesaplamaları (mevcut endpoint'lerden) ----
  const todayOrders = orders.filter((o) => isToday(o.CreatedAt));
  const todayRevenue = todayOrders
    .filter((o) => o.Status === 'Paid')
    .reduce((sum, o) => sum + Number(o.TotalAmount || 0), 0);

  const pendingCount = orders.filter((o) => o.Status === 'Pending').length;
  const servedCount = orders.filter((o) => o.Status === 'Served').length;
  const occupiedCount = tables.filter((t) => t.Status === 'Occupied').length;
  const reservedCount = tables.filter((t) => t.Status === 'Reserved').length;

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt))
    .slice(0, 6);

  const tableNumber = (tableId) =>
    tables.find((t) => t.TableId === tableId)?.TableNumber ?? tableId;

  const stats = [
    {
      num: '01',
      label: 'Günlük Ciro',
      value: money(todayRevenue),
      hint: `${todayOrders.length} bugünkü sipariş`,
      to: '/payments',
    },
    {
      num: '02',
      label: 'Açık Masa',
      value: `${occupiedCount} / ${tables.length}`,
      hint: reservedCount > 0 ? `${reservedCount} rezerve` : 'dolu / toplam',
      to: '/tables',
    },
    {
      num: '03',
      label: 'Bekleyen Sipariş',
      value: String(pendingCount),
      hint: 'mutfakta hazırlanıyor',
      to: '/orders',
    },
    {
      num: '04',
      label: 'Servise Hazır',
      value: String(servedCount),
      hint: 'ödeme bekliyor',
      to: '/orders',
    },
  ];

  return (
    <div className="p-10">
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="font-display text-4xl font-semibold text-ink mb-1">
            {greeting}, {user?.fullName?.split(' ')[0]}
          </h1>
          <p className="text-slate">
            {ROLE_LABELS[user?.role]} olarak giriş yaptın.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                     border border-sand rounded-sm px-3 py-2 transition-colors"
        >
          ↻ Yenile
        </button>
      </div>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>
      )}

      {/* Özet kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {stats.map((s) => (
          <Link
            key={s.num}
            to={s.to}
            className="group border border-sand rounded-sm bg-white p-5 hover:border-ember transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs text-ember">{s.num}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate group-hover:text-ember transition-colors">
                {s.label}
              </span>
            </div>
            <p className="font-display text-3xl font-semibold text-ink leading-none mb-2">
              {loading ? '—' : s.value}
            </p>
            <p className="font-mono text-[11px] text-slate">{s.hint}</p>
          </Link>
        ))}
      </div>

      {/* Son siparişler */}
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate">Son Siparişler</p>
        <Link to="/orders" className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80">
          Tümü →
        </Link>
      </div>

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : recentOrders.length === 0 ? (
        <div className="border border-dashed border-sand rounded-sm p-8 text-center bg-white/50">
          <p className="text-slate font-mono text-sm">Henüz sipariş yok.</p>
        </div>
      ) : (
        <div className="border border-sand rounded-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Sipariş</th>
                <th className="px-5 py-3">Masa</th>
                <th className="px-5 py-3">Durum</th>
                <th className="px-5 py-3">Tutar</th>
                <th className="px-5 py-3">Oluşturuldu</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => {
                const cfg = STATUS_CONFIG[o.Status] || STATUS_CONFIG.Pending;
                return (
                  <tr key={o.OrderId} className="border-b border-sand last:border-b-0 hover:bg-cream/30">
                    <td className="px-5 py-3 font-mono text-ink">#{o.OrderId}</td>
                    <td className="px-5 py-3 text-ink">Masa {tableNumber(o.TableId)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${cfg.border} ${cfg.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-ink">{money(o.TotalAmount)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate">{dateTime(o.CreatedAt)}</td>
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
