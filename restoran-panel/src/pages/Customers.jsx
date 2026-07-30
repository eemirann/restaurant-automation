import { useCallback, useEffect, useState } from 'react';
import client from '../api/client';

// Genel müşteri/sadaklık görünürlüğü — Tables.jsx'teki mevcut tek-kullanıcı
// arama/redeem panelinin YERİNE geçmez (aktif sipariş sırasında hâlâ orada
// lazım), bu sayfa sadece yönetim/genel görünürlük içindir.

const SORTS = [
  { value: 'date', label: 'Kayıt Tarihi' },
  { value: 'points', label: 'Puan' },
  { value: 'username', label: 'Kullanıcı Adı' },
];

const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/loyalty', { params: { search: search.trim() || undefined, sort } });
      setCustomers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Müşteriler getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => {
    const t = setTimeout(fetchCustomers, 300); // arama kutusu için basit debounce
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  return (
    <div className="p-10">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">Yönetim · Sadaklık</p>
          <h1 className="font-display text-3xl font-semibold text-paper">Müşteriler</h1>
          <p className="font-body text-sm text-slate mt-1">
            Tüm sadaklık müşterileri — puanla ürün ekleme için Masalar ekranındaki paneli kullanın.
          </p>
        </div>
        <button
          onClick={fetchCustomers}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                     border border-hairline rounded-sm px-3 py-2 transition-colors"
        >
          ↻ Yenile
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Kullanıcı adı ara..."
          className="w-64 border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper bg-charcoal
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />
        <div className="flex gap-1">
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={`font-mono text-xs uppercase tracking-wide px-3 py-2 rounded-sm border transition-colors ${
                sort === s.value ? 'border-ember bg-ember/10 text-ember font-semibold' : 'border-hairline text-slate hover:text-paper'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : customers.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-sm p-10 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Gösterilecek müşteri bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-hairline rounded-sm overflow-hidden bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Kullanıcı Adı</th>
                <th className="px-5 py-3">Puan</th>
                <th className="px-5 py-3">Kayıt Tarihi</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.CustomerId} className="border-b border-hairline last:border-b-0 hover:bg-hairline/30">
                  <td className="px-5 py-3 text-paper font-medium">{c.Username}</td>
                  <td className="px-5 py-3 font-mono text-paper">{c.LoyaltyPoints}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate">{dateTime(c.CreatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
