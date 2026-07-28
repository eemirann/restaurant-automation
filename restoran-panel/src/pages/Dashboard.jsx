import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import client from '../api/client';
import { useShift } from '../context/ShiftContext';
import { useAuth } from '../context/AuthContext';

// Vardiya süresi (canlı, saniye saniye)
const fmtDur = (from, now) => {
  if (!from) return '00:00:00';
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const CATEGORY_COLORS = ['#FF4713', '#0090FF', '#00C853', '#FFB020', '#8B5CF6', 'rgb(var(--color-slate))'];

const STATUS_CONFIG = {
  Pending: { label: 'Bekliyor', dot: 'bg-amber-500', border: 'border-amber-500/40', bg: 'bg-amber-500/15', bar: 'bg-amber-500' },
  Served: { label: 'Servis Edildi', dot: 'bg-moss', border: 'border-moss/40', bg: 'bg-moss/5', bar: 'bg-moss' },
  Paid: { label: 'Ödendi', dot: 'bg-emerald-600', border: 'border-emerald-500/40', bg: 'bg-emerald-500/15', bar: 'bg-emerald-600' },
  Cancelled: { label: 'İptal Edildi', dot: 'bg-slate', border: 'border-slate/30', bg: 'bg-slate/5', bar: 'bg-slate' },
  Merged: { label: 'Birleştirildi', dot: 'bg-ink/50', border: 'border-ink/20', bg: 'bg-ink/5', bar: 'bg-ink/40' },
};

const ACCENT_STYLES = {
  emerald: 'bg-emerald-500/15 text-emerald-400',
  blue: 'bg-blue-500/15 text-blue-400',
  ember: 'bg-ember/10 text-ember',
  moss: 'bg-moss/10 text-moss',
  rose: 'bg-rose-500/15 text-rose-400',
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

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Canlı saat + vardiya (yüzen widget yerine dashboard'da)
  const { shift } = useShift();
  const { user } = useAuth();
  const [clockNow, setClockNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const liveTime = new Date(clockNow).toLocaleTimeString('tr-TR');
  const liveDate = new Date(clockNow).toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long' });

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/dashboard');
      setData(res.data);
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
        {
          icon: <IconCoin />,
          title: 'Günlük Ciro',
          value: money(data.todayRevenue),
          subtitle: 'bugün · tahsil edilen',
          accent: 'ember',
          trend: revenueTrend !== null ? revenueTrend >= 0 : null,
        },
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
      {/* Canlı saat + vardiya durumu (yüzen widget yerine) */}
      <div className="rounded-2xl bg-ink text-cream p-5 mb-6 flex items-center justify-between gap-5 flex-wrap">
        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-cream/40 uppercase mb-1">Canlı</p>
          <p className="font-display text-4xl font-bold tabular-nums leading-none">{liveTime}</p>
          <p className="font-mono text-xs text-cream/50 mt-1 capitalize">{liveDate}</p>
        </div>
        {shift ? (
          <div className="flex items-stretch gap-2.5 flex-wrap">
            <div className="rounded-xl bg-moss/10 border border-moss/20 px-4 py-2.5 text-center min-w-[8.5rem]">
              <p className="font-mono text-[9px] uppercase tracking-wider text-cream/50 flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-moss animate-pulse" /> Vardiya Süresi
              </p>
              <p className="font-mono text-2xl font-bold tabular-nums text-moss mt-0.5">{fmtDur(shift.startedAtClient ?? shift.OpenedAt, clockNow)}</p>
            </div>
            <ShiftTile label="Kasiyer" value={user?.fullName || '—'} />
            <ShiftTile label="Beklenen Nakit" value={money(shift.ExpectedCash)} />
            <ShiftTile label="Satış" value={money(shift.CurrentSales)} />
            <ShiftTile label="Sipariş" value={shift.CurrentOrders ?? 0} />
          </div>
        ) : (
          <span className="font-mono text-xs text-cream/50">Vardiya kapalı</span>
        )}
      </div>

      <div className="flex items-center justify-between mb-6">
        {error ? (
          <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
        ) : (
          <span />
        )}
        <button
          onClick={fetchData}
          disabled={loading}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                     border border-hairline rounded-sm px-3 py-2 transition-colors
                     flex items-center gap-2 disabled:opacity-50"
        >
          <IconRefresh spinning={loading} /> Yenile
        </button>
      </div>

      {/* Üst özet kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {(!data ? Array.from({ length: 6 }) : stats).map((s, i) => (
          <StatCard key={i} stat={s} loading={loading} />
        ))}
      </div>

      {/* Saatlik Ciro + Kategori Dağılımı */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Panel title="Saatlik Ciro · Bugün">
          {!data ? (
            <div className="h-[220px] flex items-center justify-center">
              <p className="text-slate font-mono text-sm">Yükleniyor...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.hourlyRevenue} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hourlyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0090FF" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#0090FF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgb(var(--color-hairline))" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: 'rgb(var(--color-slate))', fontFamily: 'IBM Plex Mono, monospace' }}
                  axisLine={{ stroke: 'rgb(var(--color-hairline))' }}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'rgb(var(--color-slate))', fontFamily: 'IBM Plex Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={compactMoney}
                />
                <Tooltip
                  cursor={{ stroke: '#0090FF', strokeWidth: 1, strokeDasharray: '4 4' }}
                  formatter={(value) => [money(value), 'Ciro']}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid rgb(var(--color-hairline))',
                    background: 'rgb(var(--color-panel))',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 12,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  }}
                  itemStyle={{ color: 'rgb(var(--color-paper))' }}
                  labelStyle={{ color: 'rgb(var(--color-paper))' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0090FF"
                  strokeWidth={2.5}
                  fill="url(#hourlyFill)"
                  dot={{ r: 3, fill: '#0090FF', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Kategori Dağılımı · Bugün (sipariş bazlı)">
          {!data ? (
            <p className="text-slate font-mono text-sm">Yükleniyor...</p>
          ) : data.categoryDistribution.length === 0 ? (
            <EmptyState text="Bugün henüz satış yok." />
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={data.categoryDistribution}
                    dataKey="percent"
                    nameKey="category"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {data.categoryDistribution.map((entry, i) => (
                      <Cell key={entry.category} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`%${value}`, name]}
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid rgb(var(--color-hairline))',
                      background: 'rgb(var(--color-panel))',
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 12,
                    }}
                    itemStyle={{ color: 'rgb(var(--color-paper))' }}
                    labelStyle={{ color: 'rgb(var(--color-paper))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2.5">
                {data.categoryDistribution.map((entry, i) => (
                  <div key={entry.category} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                      />
                      <span className="text-sm text-paper truncate">{entry.category}</span>
                    </div>
                    <span className="font-mono text-xs text-slate shrink-0">%{entry.percent}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Kâr Oranı */}
      <Panel title="Kâr Oranı · Bugün (sipariş bazlı)" className="mb-8">
        {!data ? (
          <p className="text-slate font-mono text-sm">Yükleniyor...</p>
        ) : data.profitRatio.percent === null ? (
          <EmptyState text="Ürünlerde maliyet (Cost) girilmemiş, kâr oranı hesaplanamıyor." />
        ) : (
          <div className="flex items-center gap-6 max-w-xl">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Kâr', value: Math.max(data.profitRatio.percent, 0) },
                    { name: 'Maliyet', value: Math.max(100 - data.profitRatio.percent, 0) },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  <Cell fill="#00C853" />
                  <Cell fill="rgb(var(--color-hairline))" />
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`%${value}`, name]}
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid rgb(var(--color-hairline))',
                    background: 'rgb(var(--color-panel))',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 12,
                  }}
                  itemStyle={{ color: 'rgb(var(--color-paper))' }}
                  labelStyle={{ color: 'rgb(var(--color-paper))' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              <p className="font-display text-3xl font-semibold text-paper">%{data.profitRatio.percent}</p>
              <div className="flex items-center justify-between font-mono text-xs text-slate">
                <span>Brüt</span>
                <span>{money(data.profitRatio.revenue)}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs text-slate">
                <span>Maliyet</span>
                <span>{money(data.profitRatio.cost)}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-xs text-paper font-semibold pt-1 border-t border-hairline">
                <span>Net</span>
                <span>{money(data.profitRatio.net)}</span>
              </div>
              {data.profitRatio.hasUnpricedItems && (
                <p className="text-[11px] text-slate pt-1">
                  Not: Bazı ürünlerde maliyet girilmediği için hesaba katılmadı.
                </p>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* En Çok Satan Ürünler */}
      <Panel title="En Çok Satan Ürünler" className="mb-8">
        {!data ? (
          <p className="text-slate font-mono text-sm">Yükleniyor...</p>
        ) : data.bestSellingProducts.length === 0 ? (
          <EmptyState text="Henüz satış yok." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {data.bestSellingProducts.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 h-6 shrink-0 rounded-full bg-charcoal flex items-center justify-center font-mono text-[11px] text-slate">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-paper font-medium text-sm truncate">{p.ProductName}</span>
                    <span className="font-mono text-xs text-slate shrink-0 ml-2">{p.QuantitySold} adet</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
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

      {/* Son 7 Gün · Ciro */}
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
                  <stop offset="0%" stopColor="#FF4713" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#FF4713" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgb(var(--color-hairline))" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12, fill: 'rgb(var(--color-slate))', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={{ stroke: 'rgb(var(--color-hairline))' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'rgb(var(--color-slate))', fontFamily: 'IBM Plex Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={compactMoney}
              />
              <Tooltip
                cursor={{ stroke: '#FF4713', strokeWidth: 1, strokeDasharray: '4 4' }}
                formatter={(value) => [money(value), 'Ciro']}
                labelFormatter={(label) => label}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid rgb(var(--color-hairline))',
                  background: 'rgb(var(--color-panel))',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}
                itemStyle={{ color: 'rgb(var(--color-paper))' }}
                labelStyle={{ color: 'rgb(var(--color-paper))' }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#FF4713"
                strokeWidth={2.5}
                fill="url(#revenueFill)"
                dot={{ r: 3, fill: '#FF4713', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>

      {/* Son Siparişler + Düşük Stok */}
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
                    className={`flex items-center gap-4 rounded-xl border-l-4 ${cfg.bar} ${cfg.bg} border border-hairline/60 pl-4 pr-4 py-3`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-paper font-medium text-sm">Masa {o.TableNumber}</p>
                      <p className="font-mono text-[11px] text-slate mt-0.5">{timeAgo(o.CreatedAt)}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 border rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide shrink-0 ${cfg.border} bg-panel`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                    <p className="font-mono font-semibold text-paper shrink-0 w-24 text-right">{money(o.TotalAmount)}</p>
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
                      <p className="text-paper font-medium text-sm truncate">{p.ProductName}</p>
                      <p className="font-mono text-xs text-slate shrink-0 ml-3">
                        <span className="text-rose-400 font-semibold">{p.Quantity}</span> / {p.MinStockLevel}
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-hairline overflow-hidden">
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

      {/* Açık Masalar */}
      <Panel
        title="Açık Masalar"
        action={<Link to="/tables" className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80">Tümü →</Link>}
      >
        {!data ? (
          <p className="text-slate font-mono text-sm">Yükleniyor...</p>
        ) : data.openTables.length === 0 ? (
          <EmptyState text="Açık masa yok." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {data.openTables.map((t) => (
              <div key={t.TableNumber} className="relative border border-hairline rounded-xl p-4 bg-hairline/20 overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-ember/60" />
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-ember animate-pulse" />
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate">
                    Masa {t.TableNumber}
                  </p>
                </div>
                <p className="font-display text-xl font-semibold text-paper">{money(t.CurrentTotal)}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ============================================================
// Üst sıradaki istatistik kartı — ikon, başlık, büyük sayı, alt yazı,
// opsiyonel ilerleme çubuğu (doluluk gibi oransal veriler için).
// ============================================================
function StatCard({ stat, loading }) {
  if (!stat) {
    return <div className="bg-panel rounded-2xl border border-hairline/70 shadow-sm p-5 h-[122px] animate-pulse" />;
  }

  return (
    <div className="relative bg-panel rounded-2xl border border-hairline/70 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5">
      {typeof stat.trend === 'boolean' && (
        <span
          className={`absolute top-4 right-4 ${stat.trend ? 'text-moss' : 'text-ember'}`}
          title={stat.trend ? 'Dünden yüksek' : 'Dünden düşük'}
        >
          {stat.trend ? <IconArrowUp /> : <IconArrowDown />}
        </span>
      )}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${ACCENT_STYLES[stat.accent]}`}>
        {stat.icon}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-1">{stat.title}</p>
      <p className="font-display text-2xl font-semibold text-paper leading-none mb-1.5">
        {loading ? '—' : stat.value}
      </p>
      {typeof stat.progress === 'number' ? (
        <div className="h-1.5 rounded-full bg-hairline overflow-hidden mt-1 mb-1.5">
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
    <div className={`bg-panel rounded-2xl border border-hairline/70 shadow-sm p-6 ${className}`}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-display text-lg font-semibold text-paper">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="border border-dashed border-hairline rounded-xl py-10 text-center">
      <p className="text-slate font-mono text-sm">{text}</p>
    </div>
  );
}

// Dashboard vardiya banner'ındaki metrik kutucuğu (koyu ink zemin üzerinde)
function ShiftTile({ label, value }) {
  return (
    <div className="rounded-xl bg-white/5 px-4 py-2.5 text-center min-w-[7rem] flex flex-col justify-center">
      <p className="font-mono text-[9px] uppercase tracking-wider text-cream/40">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-cream mt-0.5 truncate">{value}</p>
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
