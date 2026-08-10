import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

const todayStr = () => new Date().toISOString().slice(0, 10);

const TABS = [
  { key: 'sales', label: 'Satış' },
  { key: 'z', label: 'Z-Raporu' },
  { key: 'products', label: 'Ürünler' },
  { key: 'staff', label: 'Personel Performansı' },
];

const REPORT_PATHS = {
  sales: '/reports/sales',
  z: '/reports/z-report',
  products: '/reports/products',
  staff: '/reports/staff-performance',
};

// CSV dosya adı önekleri — backend'in ürettiği adlarla aynı tutulur.
const CSV_PREFIXES = {
  sales: 'satis-raporu',
  products: 'urun-raporu',
  staff: 'personel-performans',
};

const METHOD_LABELS = { Cash: 'Nakit', Card: 'Kredi Kartı', FoodCard: 'Yemek Kartı', QR: 'QR' };

// Küçük istatistik kutusu
function Stat({ label, value, tone = 'text-paper' }) {
  return (
    <div className="rounded-xl bg-panel border border-hairline px-4 py-3">
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate/70">{label}</p>
      <p className={`font-mono text-lg font-bold tabular-nums mt-0.5 ${tone}`}>{value}</p>
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const params = tab === 'z' ? { date } : { from, to };
      const res = await client.get(REPORT_PATHS[tab], { params });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Rapor getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, date]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const params = tab === 'z' ? { date, format: 'csv' } : { from, to, format: 'csv' };
      const res = await client.get(REPORT_PATHS[tab], { params, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = tab === 'z' ? `z-raporu-${date}.csv` : `${CSV_PREFIXES[tab]}-${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('CSV indirilemedi.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.3em] uppercase mb-1.5">Raporlar</p>
          <h1 className="text-3xl font-extrabold text-paper leading-none tracking-tight">Satış Raporları</h1>
        </div>
        <button
          onClick={downloadCsv}
          disabled={downloading || loading || !data}
          className="text-xs font-bold uppercase tracking-wide text-white bg-[#FF6B6B] hover:bg-[#ff5555] disabled:opacity-40 rounded-xl px-4 py-2.5 shadow-lg shadow-red-500/10 transition-all"
        >
          {downloading ? 'İndiriliyor…' : '⬇ CSV İndir'}
        </button>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1.5 mb-4 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs font-bold uppercase tracking-wide px-4 py-2.5 border-b-2 transition-all ${
              tab === t.key ? 'border-[#FF6B6B] text-[#FF6B6B]' : 'border-transparent text-slate hover:text-paper'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tarih kontrolleri */}
      <div className="flex items-end gap-3 mb-6 flex-wrap">
        {tab === 'z' ? (
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Tarih</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="border border-hairline rounded-lg px-3 py-2 font-mono text-sm text-paper bg-panel focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
          </div>
        ) : (
          <>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Başlangıç</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="border border-hairline rounded-lg px-3 py-2 font-mono text-sm text-paper bg-panel focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Bitiş</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="border border-hairline rounded-lg px-3 py-2 font-mono text-sm text-paper bg-panel focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember" />
            </div>
          </>
        )}
        <button onClick={fetchReport} className="text-xs font-bold uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl px-3 py-2 bg-panel shadow-sm transition-colors">↻ Yenile</button>
      </div>

      {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>}

      {loading ? (
        <p className="text-slate font-mono text-sm animate-pulse">Yükleniyor…</p>
      ) : !data ? null : tab === 'sales' ? (
        <SalesReport data={data} />
      ) : tab === 'z' ? (
        <ZReport data={data} />
      ) : tab === 'products' ? (
        <ProductsReport data={data} />
      ) : (
        <StaffReport data={data} />
      )}
    </div>
  );
}

function SalesReport({ data }) {
  const t = data.totals || {};
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <Stat label="Net Ciro" value={money(t.NetRevenue)} tone="text-moss" />
        <Stat label="Sipariş" value={t.OrderCount ?? 0} />
        <Stat label="Ödeme" value={t.PaymentCount ?? 0} />
        <Stat label="İndirim" value={money(t.TotalDiscount)} />
        <Stat label="Bahşiş" value={money(t.TotalTip)} />
        <Stat label="İade" value={money(t.TotalRefund)} tone="text-red-500" />
      </div>
      <div className="rounded-2xl border border-hairline overflow-hidden bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-wide text-slate">
              <th className="px-4 py-2.5">Yöntem</th>
              <th className="px-4 py-2.5 text-center">Adet</th>
              <th className="px-4 py-2.5 text-right">Net Ciro</th>
              <th className="px-4 py-2.5 text-right">İndirim</th>
              <th className="px-4 py-2.5 text-right">Bahşiş</th>
            </tr>
          </thead>
          <tbody>
            {(data.byPaymentMethod || []).length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-4 text-slate text-sm">Bu aralıkta ödeme yok.</td></tr>
            ) : (
              data.byPaymentMethod.map((r) => (
                <tr key={r.PaymentMethod} className="border-b border-hairline last:border-b-0">
                  <td className="px-4 py-2.5 text-paper">{METHOD_LABELS[r.PaymentMethod] || r.PaymentMethod}</td>
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-paper">{r.PaymentCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-paper font-medium">{money(r.NetRevenue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate">{money(r.TotalDiscount)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate">{money(r.TotalTip)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ZReport({ data }) {
  return (
    <>
      <div className="rounded-2xl bg-ink text-cream p-6 mb-6 shadow-lg shadow-ink/20 max-w-md">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cream/50">Gün Sonu Net Satış · {data.date}</p>
        <p className="font-mono text-4xl font-bold tabular-nums text-moss mt-1">{money(data.NetSales)}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Stat label="Nakit" value={money(data.Cash)} />
        <Stat label="Kredi Kartı" value={money(data.Card)} />
        <Stat label="Yemek Kartı" value={money(data.FoodCard)} />
        <Stat label="QR" value={money(data.QR)} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Toplam İndirim" value={money(data.TotalDiscount)} />
        <Stat label="Toplam Bahşiş" value={money(data.TotalTip)} />
        <Stat label="Toplam İade" value={money(data.TotalRefund)} tone="text-red-500" />
        <Stat label="Sipariş / İptal" value={`${data.OrderCount ?? 0} / ${data.CancelledCount ?? 0}`} />
      </div>
    </>
  );
}

function StaffReport({ data }) {
  const rows = data.staff || [];
  const totalRevenue = rows.reduce((sum, r) => sum + (Number(r.Revenue) || 0), 0);
  const totalOrders = rows.reduce((sum, r) => sum + (Number(r.OrderCount) || 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Personel" value={rows.length} />
        <Stat label="Toplam Sipariş" value={totalOrders} />
        <Stat label="Toplam Ciro" value={money(totalRevenue)} tone="text-moss" />
        <Stat label="Ort. Sepet" value={money(totalOrders ? totalRevenue / totalOrders : 0)} />
      </div>
      <div className="rounded-2xl border border-hairline overflow-hidden bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-wide text-slate">
              <th className="px-4 py-2.5">Personel</th>
              <th className="px-4 py-2.5 text-center">Sipariş</th>
              <th className="px-4 py-2.5 text-right">Ciro</th>
              <th className="px-4 py-2.5 text-right">Ort. Sepet</th>
              <th className="px-4 py-2.5">En Çok Sattığı</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-4 text-slate text-sm">Bu aralıkta personel hareketi yok.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.UserId} className="border-b border-hairline last:border-b-0">
                  <td className="px-4 py-2.5 text-paper">
                    {r.FullName}
                    {/* Pasife alınmış personel de geçmiş performansı için listelenir */}
                    {r.IsActive === false && (
                      <span className="ml-2 font-mono text-[9px] uppercase tracking-wide text-slate border border-hairline rounded px-1.5 py-0.5">Pasif</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-paper">{r.OrderCount}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-paper font-medium">{money(r.Revenue)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-slate">{money(r.AvgBasket)}</td>
                  <td className="px-4 py-2.5 text-slate text-xs">
                    {r.TopProductName ? `${r.TopProductName} (${r.TopProductQuantity})` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductsReport({ data }) {
  const rows = data.products || [];
  return (
    <div className="rounded-2xl border border-hairline overflow-hidden bg-panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-wide text-slate">
            <th className="px-4 py-2.5">Ürün</th>
            <th className="px-4 py-2.5 text-center">Adet</th>
            <th className="px-4 py-2.5 text-right">Ciro</th>
            <th className="px-4 py-2.5 text-right">Maliyet</th>
            <th className="px-4 py-2.5 text-right">Kâr</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-4 text-slate text-sm">Bu aralıkta satış yok.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.ProductId} className="border-b border-hairline last:border-b-0">
                <td className="px-4 py-2.5 text-paper">{r.ProductName}</td>
                <td className="px-4 py-2.5 text-center font-mono text-xs text-paper">{r.QuantitySold}</td>
                <td className="px-4 py-2.5 text-right font-mono text-paper">{money(r.Revenue)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate">{r.Cost == null ? '—' : money(r.Cost)}</td>
                <td className={`px-4 py-2.5 text-right font-mono font-medium ${r.Profit == null ? 'text-slate' : Number(r.Profit) >= 0 ? 'text-moss' : 'text-red-500'}`}>
                  {r.Profit == null ? '—' : money(r.Profit)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
