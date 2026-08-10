import { useEffect, useState, useCallback } from 'react';
import client from '../api/client';

// Kategoriler — Ekstralar/Şuruplar sayfalarındaki aynı arama + A-Z/Z-A
// sıralama deseni burada da kullanılıyor.
export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/categories');
      setCategories(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Kategoriler getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  let visibleCategories = categories.filter((c) =>
    c.Name.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'))
  );

  visibleCategories = [...visibleCategories];
  if (sortBy === 'name-asc') {
    visibleCategories.sort((a, b) => a.Name.localeCompare(b.Name, 'tr-TR'));
  } else if (sortBy === 'name-desc') {
    visibleCategories.sort((a, b) => b.Name.localeCompare(a.Name, 'tr-TR'));
  }

  const deactivate = async (category) => {
    if (!window.confirm(`"${category.Name}" pasife alınsın mı?`)) return;
    setActionError('');
    try {
      await client.delete(`/categories/${category.CategoryId}`);
      fetchCategories();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Kategori pasife alınamadı.');
    }
  };

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.3em] uppercase mb-2">
            Menü · Kategoriler
          </p>
          <h1 className="text-4xl font-extrabold text-paper tracking-tight">Kategoriler</h1>
          <p className="font-body text-sm text-slate mt-1">
            Ürünlerin gruplandığı kategoriler — ürün formundaki açılır listeyi besler.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchCategories}
            className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-xl px-3 py-2 bg-panel shadow-sm transition-colors"
          >
            ↻ Yenile
          </button>
          <button
            onClick={() => { setEditingCategory(null); setShowModal(true); }}
            className="text-[11px] font-bold uppercase tracking-wide text-white bg-[#FF6B6B]
                       hover:bg-[#ff5555] rounded-xl px-4 py-2 shadow-lg shadow-red-500/10 transition-all"
          >
            + Yeni Kategori
          </button>
        </div>
      </div>

      {/* Arama / Sırala */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Kategori ara..."
          className="flex-1 min-w-[16rem] max-w-sm border border-hairline rounded-xl px-4 py-2.5 font-body text-paper
                     focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-[#FF6B6B]"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-hairline rounded-xl px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-paper bg-panel
                     focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-[#FF6B6B]"
        >
          <option value="name-asc">Ad (A-Z)</option>
          <option value="name-desc">Ad (Z-A)</option>
        </select>
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : visibleCategories.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-3xl p-10 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Gösterilecek kategori bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-stone-100 rounded-3xl overflow-hidden bg-panel shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hairline/60 border-b border-hairline text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Ad</th>
                <th className="px-5 py-3">Durum</th>
                <th className="px-5 py-3 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {visibleCategories.map((category) => {
                const isActive = category.IsActive !== false && category.IsActive !== 0;
                return (
                  <tr key={category.CategoryId} className="border-b border-hairline last:border-b-0 hover:bg-hairline/30">
                    <td className="px-5 py-3 text-paper font-medium">{category.Name}</td>
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
                          onClick={() => { setEditingCategory(category); setShowModal(true); }}
                          className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl px-2.5 py-1.5 transition-colors"
                        >
                          Düzenle
                        </button>
                        {isActive && (
                          <button
                            onClick={() => deactivate(category)}
                            className="text-[11px] font-bold uppercase tracking-wide text-[#FF6B6B] hover:text-white hover:bg-[#FF6B6B] border border-[#FF6B6B]/40 rounded-xl px-2.5 py-1.5 transition-all"
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
        <CategoryFormModal
          category={editingCategory}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchCategories(); }}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ category, onClose, onSaved }) {
  const [name, setName] = useState(category?.Name || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Kategori adı zorunludur.'); return; }

    setSubmitting(true);
    try {
      if (category) {
        await client.put(`/categories/${category.CategoryId}`, { Name: name.trim() });
      } else {
        await client.post('/categories', { Name: name.trim() });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Kategori kaydedilemedi.');
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
            <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.25em] uppercase mb-1">Kategori</p>
            <h2 className="font-display text-lg font-semibold text-paper leading-tight">
              {category ? 'Kategoriyi Düzenle' : 'Yeni Kategori'}
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
              placeholder="ör. Sıcak İçecekler, Tatlılar..."
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper bg-panel
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-panel py-2">{error}</p>
          )}
        </form>

        <div className="px-6 py-4 border-t border-hairline shrink-0 bg-panel flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 text-xs font-bold uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-xl px-4 py-3 transition-colors disabled:opacity-50"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 text-xs font-bold uppercase tracking-wide text-white bg-[#FF6B6B]
                       hover:bg-[#ff5555] active:bg-[#ff4444] disabled:opacity-40 disabled:cursor-not-allowed
                       rounded-xl px-6 py-3 shadow-lg shadow-red-500/10 transition-all"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
