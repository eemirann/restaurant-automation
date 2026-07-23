import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
};

const STATUS_CONFIG = {
  Pending: { label: 'Bekliyor', dot: 'bg-amber-500', border: 'border-amber-300', bg: 'bg-amber-50', bar: 'bg-amber-500' },
  Served: { label: 'Servis Edildi', dot: 'bg-moss', border: 'border-moss/40', bg: 'bg-moss/5', bar: 'bg-moss' },
  Paid: { label: 'Ödendi', dot: 'bg-emerald-600', border: 'border-emerald-300', bg: 'bg-emerald-50', bar: 'bg-emerald-600' },
  Cancelled: { label: 'İptal Edildi', dot: 'bg-slate', border: 'border-slate/30', bg: 'bg-slate/5', bar: 'bg-slate' },
  Merged: { label: 'Birleştirildi', dot: 'bg-ink/50', border: 'border-ink/20', bg: 'bg-ink/5', bar: 'bg-ink/40' },
};

const ACCENT_STYLES = {
  emerald: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  ember: 'bg-ember/10 text-ember',
  moss: 'bg-moss/10 text-moss',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate/10 text-slate',
};

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const compactMoney = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;

const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const timeAgo = (iso) => {
  if (!iso) return '—';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} sa önce`;
  return dateTime(iso);
};

const clockStr = (d) => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function Dashboard() {
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/dashboard');
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.response?.data?.error || 'Dashboard verileri getirilemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalTables = data ? data.occupiedTables + data.availableTables : 0;
  const occupancyPct = totalTables ? Math.round((data.occupiedTables / totalTables) * 100) : 0;
  const avgTicket = data && data.todayOrders ? data.todayRevenue / data.todayOrders : 0;

  const yesterdayRevenue = data?.weeklyRevenue?.[5]?.revenue ?? 0;
  const revenueTrend =
    data && yesterdayRevenue > 0
      ? Math.round(((data.todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : null;

  const stats = data
    ? [
        { icon: <IconReceipt />, title: 'Bugünkü Sipariş', value: data.todayOrders, subtitle: 'bugün oluşturulan', accent: 'blue' },
        { icon: <IconCoin />, title: 'Ortalama Sepet', value: money(avgTicket), subtitle: 'sipariş başına', accent: 'ember' },
        {
          icon: <IconGrid />,
          title: 'Doluluk Oranı',
          value: `${data.occupiedTables} / ${totalTables}`,
          subtitle: `masa dolu · %${occupancyPct}`,
          accent: 'moss',
          progress: occupancyPct,
        },
        { icon: <IconAlert />, title: 'Düşük Stok', value: data.lowStockCount, subtitle: 'ürün dikkat gerektiriyor', accent: 'rose' },
        { icon: <IconBox />, title: 'Toplam Ürün', value: data.totalProducts, subtitle: 'menüdeki ürün sayısı', accent: 'slate' },
      ]
    : [];

  const maxSold = data?.bestSellingProducts?.length
    ? Math.max(...data.bestSellingProducts.map((p) => p.QuantitySold))
    : 0;

  return (
    <div className="p-10">
      {/* Komuta şeridi */}
      <div className="relative overflow-hidden rounded-2xl bg-ink text-cream p-8 mb-8">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-ember/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
              {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="font-display text-4xl font-semibold mb-1">
              {greeting}, {user?.fullName?.split(' ')[0]}
            </h1>
            <p className="text-sand/60 text-sm">{ROLE_LABELS[user?.role]} olarak giriş yaptın.</p>
          </div>

          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-widest text-sand/40 mb-1.5">Şu an</p>
            <p className="font-mono text-2xl tabular-nums text-cream">{clockStr(now)}</p>
            <p className="font-mono text-[10px] text-sand/40 mt-1">
              {lastUpdated ? `Güncellendi: ${clockStr(lastUpdated)}` : '—'}
            </p>
          </div>
        </div>

        <div className="relative flex flex-wrap items-end justify-between gap-6 mt-8 pt-6 border-t border-cream/10">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-sand/40 mb-1.5">Bugünkü Ciro</p>
            <div className="flex items-baseline gap-3">
              <p className="font-display text-5xl font-semibold text-cream leading-none">
                {data ? money(data.todayRevenue) : '—'}
              </p>
              {revenueTrend !== null && (
                <span
                  className={`inline-flex items-center gap-1 font-mono text-xs px-2 py-1 rounded-full ${
                    revenueTrend >= 0 ? 'bg-moss/20 text-moss' : 'bg-ember/20 text-ember'
                  }`}
                >
                  {revenueTrend >= 0 ? <IconArrowUp /> : <IconArrowDown />}
                  {Math.abs(revenueTrend)}% dünden
                </span>
              )}
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="font-mono text-xs uppercase tracking-wide text-sand/70 hover:text-cream
                       border border-cream/20 hover:border-cream/40 rounded-sm px-3 py-2 transition-colors
                       flex items-center gap-2 disabled:opacity-50"
          >
            <IconRefresh spinning={loading} /> Yenile
          </button>
        </div>
      </div>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>
      )}

      {/* Üst özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-8">
        {(!data ? Array.from({ length: 5 }) : stats).map((s, i) => (
          <StatCard key={i} stat={s} loading={loading} />
        ))}
      </div>

      {/* Ciro grafiği */}
      <Panel title="Son 7 Gün · Ciro" className="mb-8">
        {!data ? (
          <div className="h-[280px] flex items-center justify-center">
            <p className="text-slate font-mono text-sm">Yükleniyor...</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.weeklyRevenue} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#B5482A" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#B5482A" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#E8E1D3" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12, fill: '#5B5A56', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={{ stroke: '#E8E1D3' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#5B5A56', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={compactMoney}
              />
              <Tooltip
                cursor={{ stroke: '#B5482A', strokeWidth: 1, strokeDasharray: '4 4' }}
                formatter={(value) => [money(value), 'Ciro']}
                labelFormatter={(label) => label}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #E8E1D3',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#B5482A"
                strokeWidth={2.5}
                fill="url(#revenueFill)"
                dot={{ r: 3, fill: '#B5482A', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* İkinci sıra: Son Siparişler + Düşük Stok */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Panel
          title="Son Siparişler"
          action={<Link to="/orders" className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80">Tümü →</Link>}
        >
          {!data ? (
            <p className="text-slate font-mono text-sm">Yükleniyor...</p>
          ) : data.recentOrders.length === 0 ? (
            <EmptyState text="Henüz sipariş yok." />
          ) : (
            <div className="space-y-2.5">
              {data.recentOrders.map((o) => {
                const cfg = STATUS_CONFIG[o.Status] || STATUS_CONFIG.Pending;
                return (
                  <div
                    key={o.OrderId}
                    className={`flex items-center gap-4 rounded-xl border-l-4 ${cfg.bar} ${cfg.bg} border border-sand/60 pl-4 pr-4 py-3`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-ink font-medium text-sm">Masa {o.TableNumber}</p>
                      <p className="font-mono text-[11px] text-slate mt-0.5">{timeAgo(o.CreatedAt)}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide shrink-0 ${cfg.border} bg-white`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    <p className="font-mono font-semibold text-ink shrink-0 w-24 text-right">{money(o.TotalAmount)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title="Düşük Stok Ürünleri"
          action={<Link to="/stock" className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80">Tümü →</Link>}
        >
          {!data ? (
            <p className="text-slate font-mono text-sm">Yükleniyor...</p>
          ) : data.lowStockProducts.length === 0 ? (
            <EmptyState text="Düşük stokta ürün yok." />
          ) : (
            <div className="space-y-3.5">
              {data.lowStockProducts.map((p, i) => {
                const ratio = p.MinStockLevel > 0 ? Math.min(p.Quantity / p.MinStockLevel, 1) : 0;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-ink font-medium text-sm truncate">{p.ProductName}</p>
                      <p className="font-mono text-xs text-slate shrink-0 ml-3">
                        <span className="text-rose-600 font-semibold">{p.Quantity}</span> / {p.MinStockLevel}
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-sand overflow-hidden">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{ width: `${Math.max(ratio * 100, 6)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Üçüncü sıra: Açık Masalar + En Çok Satanlar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title="Açık Masalar"
          action={<Link to="/tables" className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80">Tümü →</Link>}
        >
          {!data ? (
            <p className="text-slate font-mono text-sm">Yükleniyor...</p>
          ) : data.openTables.length === 0 ? (
            <EmptyState text="Açık masa yok." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.openTables.map((t) => (
                <div key={t.TableNumber} className="relative border border-sand rounded-xl p-4 bg-cream/20 overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-ember/60" />
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-ember animate-pulse" />
                    <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
                      Masa {t.TableNumber}
                    </p>
                  </div>
                  <p className="font-display text-xl font-semibold text-ink">{money(t.CurrentTotal)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="En Çok Satan Ürünler">
          {!data ? (
            <p className="text-slate font-mono text-sm">Yükleniyor...</p>
          ) : data.bestSellingProducts.length === 0 ? (
            <EmptyState text="Henüz satış yok." />
          ) : (
            <div className="space-y-4">
              {data.bestSellingProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-cream flex items-center justify-center font-mono text-[11px] text-slate">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-ink font-medium text-sm truncate">{p.ProductName}</span>
                      <span className="font-mono text-xs text-slate shrink-0 ml-2">{p.QuantitySold} adet</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-sand overflow-hidden">
                      <div
                        className="h-full rounded-full bg-ember"
                        style={{ width: `${maxSold ? Math.max((p.QuantitySold / maxSold) * 100, 6) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ============================================================
// Üst sıradaki istatistik kartı — ikon, başlık, büyük sayı, alt yazı,
// opsiyonel ilerleme çubuğu (doluluk gibi oransal veriler için).
// ============================================================
function StatCard({ stat, loading }) {
  if (!stat) {
    return <div className="bg-white rounded-2xl border border-sand/70 shadow-sm p-6 h-[148px] animate-pulse" />;
  }

  return (
    <div className="bg-white rounded-2xl border border-sand/70 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-6">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${ACCENT_STYLES[stat.accent]}`}>
        {stat.icon}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-1.5">{stat.title}</p>
      <p className="font-display text-3xl font-semibold text-ink leading-none mb-2">
        {loading ? '—' : stat.value}
      </p>
      {typeof stat.progress === 'number' ? (
        <div className="h-1.5 rounded-full bg-sand overflow-hidden mt-1 mb-2">
          <div className="h-full rounded-full bg-moss" style={{ width: `${stat.progress}%` }} />
        </div>
      ) : null}
      <p className="text-xs text-slate">{stat.subtitle}</p>
    </div>
  );
}

// ============================================================
// İkinci/üçüncü sıradaki kartlar için ortak, yuvarlak köşeli, yumuşak
// gölgeli kabuk — başlık ve opsiyonel bir sağ üst aksiyon linki alır.
// ============================================================
function Panel({ title, action, className = '', children }) {
  return (
    <div className={`bg-white rounded-2xl border border-sand/70 shadow-sm p-6 ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="border border-dashed border-sand rounded-xl py-10 text-center">
      <p className="text-slate font-mono text-sm">{text}</p>
    </div>
  );
}

// ============================================================
// Küçük, tutarlı çizgi ikonlar (harici bağımlılık eklemeden).
// ============================================================
const iconProps = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

function IconReceipt() {
  return (
    <svg {...iconProps}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}
function IconCoin() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 10a2 2 0 0 1 2-2h1a2 2 0 1 1 0 4h-1a2 2 0 1 0 0 4h1a2 2 0 0 0 2-2" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg {...iconProps}>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg {...iconProps}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}
function IconArrowUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
function IconArrowDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}
function IconRefresh({ spinning }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={spinning ? 'animate-spin' : ''}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 4v6h-6" />
    </svg>
  );
}
