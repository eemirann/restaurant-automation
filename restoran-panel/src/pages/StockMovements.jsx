import { useEffect, useState } from 'react';
import client from '../api/client';

const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function StockMovements() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Basit fonksiyon, useCallback yok
  const fetchMovements = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/stock/movements');
      setMovements(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Stok hareketleri getirilemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
  }, []);

  const filteredMovements = movements.filter((m) =>
    m.ProductName.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'))
  );

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Depo · Envanter
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">Stok Hareketleri</h1>
        </div>
        <button
          onClick={fetchMovements}
          className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                     border border-sand rounded-sm px-3 py-2 transition-colors"
        >
          ↻ Yenile
        </button>
      </div>

      {/* Arama kutusu */}
      <div className="mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Ürün ara..."
          className="w-full max-w-sm border border-sand rounded-sm px-4 py-2.5 font-body text-ink
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />
      </div>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">{error}</p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : filteredMovements.length === 0 ? (
        <div className="border border-dashed border-sand rounded-sm p-10 text-center bg-white/50">
          <p className="text-slate font-mono text-sm">Gösterilecek stok hareketi bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-sand rounded-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Tarih</th>
                <th className="px-5 py-3">Ürün</th>
                <th className="px-5 py-3">Tür</th>
                <th className="px-5 py-3">Adet</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map((m) => {
                const isIn = m.MovementType === 'IN';
                return (
                  <tr key={m.StockMovementId} className="border-b border-sand last:border-b-0 hover:bg-cream/30">
                    <td className="px-5 py-3 font-mono text-xs text-slate">{dateTime(m.MovementDate)}</td>
                    <td className="px-5 py-3 text-ink font-medium">{m.ProductName}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${
                          isIn ? 'border-moss/40 bg-moss/5' : 'border-ember/40 bg-ember/5'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isIn ? 'bg-moss' : 'bg-ember'}`} />
                        {isIn ? 'Giriş' : 'Çıkış'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-ink">{m.Quantity}</td>
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
