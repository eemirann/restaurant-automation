import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const STATUS_CONFIG = {
  Empty: { label: 'Boş', dot: 'bg-moss', border: 'border-sand', bg: 'bg-white' },
  Occupied: { label: 'Dolu', dot: 'bg-ember', border: 'border-ember/40', bg: 'bg-ember/5' },
  Reserved: { label: 'Rezerve', dot: 'bg-amber-500', border: 'border-amber-300', bg: 'bg-amber-50' },
};

const FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'Empty', label: 'Boş' },
  { value: 'Occupied', label: 'Dolu' },
  { value: 'Reserved', label: 'Rezerve' },
];

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const fetchTables = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/tables', {
        params: filter ? { status: filter } : {},
      });
      setTables(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Masalar getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const counts = tables.reduce((acc, t) => {
    acc[t.Status] = (acc[t.Status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Masa Düzeni
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">Masalar</h1>
        </div>
        <button
          onClick={fetchTables}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                     border border-sand rounded-sm px-3 py-2 transition-colors"
        >
          ↻ Yenile
        </button>
      </div>

      {/* Durum özeti */}
      <div className="flex gap-6 mb-6 font-mono text-xs text-slate">
        <span><span className="text-ink font-semibold">{tables.length}</span> toplam</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-moss inline-block" />
          {counts.Empty || 0} boş
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-ember inline-block" />
          {counts.Occupied || 0} dolu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          {counts.Reserved || 0} rezerve
        </span>
      </div>

      {/* Filtre sekmeleri */}
      <div className="flex gap-1 mb-8 border-b border-sand">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`font-mono text-xs uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors ${
              filter === f.value
                ? 'border-ember text-ink font-semibold'
                : 'border-transparent text-slate hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : tables.length === 0 ? (
        <div className="border border-dashed border-sand rounded-sm p-10 text-center bg-white/50">
          <p className="text-slate font-mono text-sm">Gösterilecek masa bulunamadı.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {tables.map((table) => {
            const cfg = STATUS_CONFIG[table.Status] || STATUS_CONFIG.Empty;
            return (
              <div
                key={table.TableId}
                className={`relative rounded-sm border ${cfg.border} ${cfg.bg} px-5 py-6
                            transition-transform hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <span className={`absolute top-4 right-4 w-2 h-2 rounded-full ${cfg.dot}`} />
                <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-3">
                  Masa
                </p>
                <p className="font-display text-3xl font-semibold text-ink mb-3">
                  {table.TableNumber}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate">
                    {table.Capacity} kişilik
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-slate">
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
