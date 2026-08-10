import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

// Ekstralar (ekstra shot, ekstra çikolata, şurup vb.) — Ürünler/Stok sayfalarındaki
// aynı arama + A-Z/Z-A sıralama deseni burada da kullanılıyor.
export default function Extras() {
  const [extras, setExtras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');

  const [showModal, setShowModal] = useState(false);
  const [editingExtra, setEditingExtra] = useState(null);

  const fetchExtras = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/extras');
      setExtras(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Ekstralar getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExtras(); }, [fetchExtras]);

  let visibleExtras = extras.filter((e) =>
    e.Name.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'))
  );

  visibleExtras = [...visibleExtras];
  if (sortBy === 'name-asc') {
    visibleExtras.sort((a, b) => a.Name.localeCompare(b.Name, 'tr-TR'));
  } else if (sortBy === 'name-desc') {
    visibleExtras.sort((a, b) => b.Name.localeCompare(a.Name, 'tr-TR'));
  } else if (sortBy === 'price-asc') {
    visibleExtras.sort((a, b) => a.Price - b.Price);
  } else if (sortBy === 'price-desc') {
    visibleExtras.sort((a, b) => b.Price - a.Price);
  }

  const deactivate = async (extra) => {
    if (!window.confirm(`"${extra.Name}" pasife alınsın mı?`)) return;
    setActionError('');
    try {
      await client.delete(`/extras/${extra.ProductId}`);
      fetchExtras();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Ekstra pasife alınamadı.');
    }
  };

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Menü · Eklentiler
          </p>
          <h1 className="font-display text-3xl font-semibold text-paper">Ekstralar</h1>
          <p className="font-body text-sm text-slate mt-1">
            Ekstra shot, ekstra çikolata, şurup vb. — sipariş kalemine eklenip fiyata yansıtılır.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchExtras}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-hairline rounded-sm px-3 py-2 transition-colors"
          >
            ↻ Yenile
          </button>
          <button
            onClick={() => { setEditingExtra(null); setShowModal(true); }}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 rounded-sm px-4 py-2 transition-colors"
          >
            + Yeni Ekstra
          </button>
        </div>
      </div>

      {/* Arama / Sırala */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Ekstra ara..."
          className="flex-1 min-w-[16rem] max-w-sm border border-hairline rounded-sm px-4 py-2.5 font-body text-paper
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-hairline rounded-sm px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-paper bg-panel
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        >
          <option value="name-asc">Ad (A-Z)</option>
          <option value="name-desc">Ad (Z-A)</option>
          <option value="price-asc">Fiyat (Az → Çok)</option>
          <option value="price-desc">Fiyat (Çok → Az)</option>
        </select>
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : visibleExtras.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-sm p-10 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Gösterilecek ekstra bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-hairline rounded-sm overflow-hidden bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Ad</th>
                <th className="px-5 py-3">Ekstra Ücret</th>
                <th className="px-5 py-3">Porsiyon Tüketimi</th>
                <th className="px-5 py-3">Stok</th>
                <th className="px-5 py-3">Durum</th>
                <th className="px-5 py-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {visibleExtras.map((extra) => {
                const isActive = extra.IsActive !== false && extra.IsActive !== 0;
                const hasStock = extra.StockQuantity !== null && extra.StockQuantity !== undefined;
                return (
                  <tr key={extra.ProductId} className="border-b border-hairline last:border-b-0 hover:bg-hairline/30">
                    <td className="px-5 py-3 text-paper font-medium">{extra.Name}</td>
                    <td className="px-5 py-3 font-mono text-paper">{money(extra.Price)}</td>
                    <td className="px-5 py-3 font-mono text-slate">
                      {extra.ServingSize ? `1 porsiyon = ${extra.ServingSize} birim` : '1 porsiyon = 1 birim (varsayılan)'}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate">
                      {hasStock ? `${extra.StockQuantity}` : '— takip edilmiyor'}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${
                          isActive ? 'border-moss/40 bg-moss/5' : 'border-slate/40 bg-slate/5'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-moss' : 'bg-slate'}`} />
                        {isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => { setEditingExtra(extra); setShowModal(true); }}
                          className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-sm px-2.5 py-1.5 transition-colors"
                        >
                          Düzenle
                        </button>
                        {isActive && (
                          <button
                            onClick={() => deactivate(extra)}
                            className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2.5 py-1.5 transition-colors"
                          >
                            Pasife Al
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ExtraFormModal
          extra={editingExtra}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchExtras(); }}
        />
      )}
    </div>
  );
}

function ExtraFormModal({ extra, onClose, onSaved }) {
  const [name, setName] = useState(extra?.Name || '');
  const [price, setPrice] = useState(extra?.Price ?? '');
  const [servingSize, setServingSize] = useState(extra?.ServingSize ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Ekstra adı zorunludur.'); return; }
    if (price === '' || Number(price) < 0) { setError('Fiyat negatif olmayan bir sayı olmalıdır.'); return; }
    if (servingSize !== '' && Number(servingSize) <= 0) { setError('Porsiyon başına tüketim 0\'dan büyük olmalıdır.'); return; }

    setSubmitting(true);
    try {
      const body = { Name: name.trim(), Price: Number(price), ServingSize: servingSize === '' ? null : Number(servingSize) };
      if (extra) {
        await client.put(`/extras/${extra.ProductId}`, body);
      } else {
        await client.post('/extras', body);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Ekstra kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-ink/50" onClick={() => !submitting && onClose()} />

      <div className="relative w-full max-w-md h-full bg-panel shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        <div className="px-6 py-4 border-b border-hairline flex items-start justify-between shrink-0 bg-panel">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-ember uppercase mb-1">Ekstra</p>
            <h2 className="font-display text-lg font-semibold text-paper leading-tight">
              {extra ? 'Ekstrayı Düzenle' : 'Yeni Ekstra'}
            </h2>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="font-mono text-xs text-slate hover:text-paper w-9 h-9 flex items-center justify-center shrink-0 rounded-sm hover:bg-charcoal transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 bg-hairline/10 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ad</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. Ekstra Shot, Vanilyalı Şurup..."
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ekstra Ücret</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              1 Porsiyon Kaç Stok Birimi Tüketir? (opsiyonel)
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={servingSize}
              onChange={(e) => setServingSize(e.target.value)}
              placeholder="ör. 15 (stok ml ise, 1 porsiyon = 15 ml)"
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
            <p className="font-mono text-[11px] text-slate mt-1.5">
              Boş bırakılırsa 1 porsiyon = 1 stok birimi sayılır (eski davranış).
            </p>
          </div>

          {!extra && (
            <p className="font-mono text-[11px] text-slate bg-hairline/60 border border-hairline rounded-sm px-3 py-2">
              Kaydettikten sonra bu ekstra için Stok sayfasından stok takibi ekleyebilirsiniz (opsiyonel).
            </p>
          )}

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-panel py-2">{error}</p>
          )}
        </form>

        <div className="px-6 py-4 border-t border-hairline shrink-0 bg-panel flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 font-mono text-xs uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-sm px-4 py-3 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 font-mono text-sm uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                       rounded-sm px-6 py-3 transition-colors shadow-sm"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
