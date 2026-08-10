import { useEffect, useState, useCallback, useRef } from 'react';
import client, { imageUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import ProductModal from '../components/ProductModal';

const FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Pasif' },
];

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

// Resmi olmayan ürünler için baş harf monogramı (ör. "Ice Latte" → "IL").
const initials = (name) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toLocaleUpperCase('tr-TR');

export default function Products() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionError, setActionError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Menü verisi dışa/içe aktarma (bkz. controllers/dataTransferController.js)
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/products');
      setProducts(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Ürünler getirilemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    client.get('/categories').then((res) => setCategories(res.data)).catch(() => {});
  }, []);

  const categoryName = (categoryId) =>
    categories.find((c) => c.CategoryId === categoryId)?.Name || `Kategori #${categoryId}`;

  const deactivateProduct = async (productId) => {
    if (!window.confirm('Bu ürünü pasife almak istediğinize emin misiniz?')) return;
    setActionError('');
    try {
      await client.delete(`/products/${productId}`);
      fetchProducts();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Ürün pasife alınamadı.');
    }
  };

const reactivateProduct = async (productId) => {
    setActionError('');
    try {
      await client.patch(`/products/${productId}/activate`);
      fetchProducts();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Ürün aktif edilemedi.');
    }
  };

  // "86 / Tükendi": ürünü silmeden geçici satışa aç/kapat
  const isAvailable = (p) => p.IsAvailable !== false && p.IsAvailable !== 0;
  const toggleAvailability = async (p) => {
    setActionError('');
    try {
      await client.patch(`/products/${p.ProductId}/availability`, { IsAvailable: !isAvailable(p) });
      fetchProducts();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Satış durumu güncellenemedi.');
    }
  };

  // ---- Dışa Aktar: GET /products/export -> tarayıcıda JSON dosya indirir ----
  const exportMenu = async () => {
    setExporting(true);
    setActionError('');
    try {
      const res = await client.get('/products/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `menu-disa-aktarim-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Menü verisi dışa aktarılamadı.');
    } finally {
      setExporting(false);
    }
  };

  // ---- İçe Aktar: dosya seçici -> JSON'u oku -> POST /products/import ----
  const triggerImport = () => fileInputRef.current?.click();

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // aynı dosyayı tekrar seçebilmek için
    if (!file) return;

    setImportError('');
    setImportSummary(null);
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await client.post('/products/import', data);
      setImportSummary(res.data);
      await fetchProducts();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setImportError('Dosya geçerli bir JSON değil.');
      } else {
        setImportError(err.response?.data?.error || 'Menü verisi içe aktarılamadı.');
      }
    } finally {
      setImporting(false);
    }
  };

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('tr-TR');
  const visibleProducts = products.filter((p) => {
    if (filter === 'active' && (p.IsActive === false || p.IsActive === 0)) return false;
    if (filter === 'inactive' && p.IsActive !== false && p.IsActive !== 0) return false;
    if (normalizedSearch) {
      const nameMatch = p.Name?.toLocaleLowerCase('tr-TR').includes(normalizedSearch);
      const descMatch = p.Description?.toLocaleLowerCase('tr-TR').includes(normalizedSearch);
      if (!nameMatch && !descMatch) return false;
    }
    return true;
  });

  const activeCount = products.filter((p) => p.IsActive !== false && p.IsActive !== 0).length;
  const inactiveCount = products.length - activeCount;

  // Ürünleri kategoriye göre grupla (kategori sırasını koru, kategorisi olmayanlar en sona).
  const groupedByCategory = (() => {
    const groups = new Map();
    categories.forEach((c) => groups.set(c.CategoryId, { name: c.Name, items: [] }));
    visibleProducts.forEach((p) => {
      if (!groups.has(p.CategoryId)) {
        groups.set(p.CategoryId, { name: categoryName(p.CategoryId), items: [] });
      }
      groups.get(p.CategoryId).items.push(p);
    });
    return [...groups.values()].filter((g) => g.items.length > 0);
  })();

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.3em] uppercase mb-2">
            Menü · Mutfak
          </p>
          <h1 className="text-4xl font-extrabold text-paper tracking-tight">Ürünler</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchProducts}
            className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-xl px-3 py-2 bg-panel shadow-sm transition-colors"
          >
            ↻ Yenile
          </button>
          {isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                onClick={triggerImport}
                disabled={importing}
                title="Bir JSON dosyasından kategori/ürün/varyant/reçete içe aktar"
                className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper
                           border border-hairline rounded-xl px-3 py-2 bg-panel shadow-sm transition-colors disabled:opacity-50"
              >
                {importing ? 'İçe Aktarılıyor…' : '⇧ İçe Aktar'}
              </button>
              <button
                onClick={exportMenu}
                disabled={exporting}
                title="Kategori/ürün/varyant/reçete verisini JSON olarak indir"
                className="text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper
                           border border-hairline rounded-xl px-3 py-2 bg-panel shadow-sm transition-colors disabled:opacity-50"
              >
                {exporting ? 'İndiriliyor…' : '⇩ Dışa Aktar'}
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-[11px] font-bold uppercase tracking-wide text-white bg-[#FF6B6B]
                           hover:bg-[#ff5555] rounded-xl px-4 py-2 shadow-lg shadow-red-500/10 transition-all"
              >
                + Yeni Ürün
              </button>
            </>
          )}
        </div>
      </div>

      {/* Durum özeti */}
      <div className="flex flex-wrap gap-6 mb-6 font-mono text-xs text-slate">
        <span><span className="text-paper font-semibold">{products.length}</span> toplam</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block bg-moss" />
          {activeCount} aktif
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block bg-slate" />
          {inactiveCount} pasif
        </span>
      </div>

      {/* Arama */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate/60 text-sm">🔍</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ürün ara..."
            className="w-full border border-hairline rounded-xl pl-9 pr-3 py-2.5 font-body text-paper
                       focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-[#FF6B6B]"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate hover:text-[#FF6B6B] text-xs">✕</button>
          )}
        </div>
      </div>

      {/* Filtre sekmeleri */}
      <div className="flex gap-1 mb-6 border-b border-hairline">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-[11px] font-bold uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors ${
              filter === f.value
                ? 'border-[#FF6B6B] text-[#FF6B6B]'
                : 'border-transparent text-slate hover:text-paper'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(error || actionError || importError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError || importError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : visibleProducts.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-3xl p-10 text-center bg-panel/50">
          <p className="text-slate font-mono text-sm">Gösterilecek ürün bulunamadı.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {groupedByCategory.map((group) => (
            <div key={group.name}>
              {/* Kategori başlığı */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="font-display text-lg font-semibold text-paper">{group.name}</h2>
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate">
                  {group.items.length} ürün
                </span>
                <div className="flex-1 h-px bg-hairline" />
              </div>

              {/* 4'lü ürün kartı grid'i */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {group.items.map((p) => {
                  const active = p.IsActive !== false && p.IsActive !== 0;
                  return (
                    <div
                      key={p.ProductId}
                      className={`group relative rounded-2xl border bg-panel overflow-hidden transition-all duration-200
                                  hover:-translate-y-0.5 hover:shadow-md ${
                                    active ? 'border-hairline' : 'border-hairline opacity-60'
                                  }`}
                    >
                      {/* Görsel / monogram alanı */}
                      <div className="relative h-32 bg-hairline/30 flex items-center justify-center overflow-hidden">
                        {p.ImageUrl ? (
                          <img
                            src={imageUrl(p.ImageUrl)}
                            alt={p.Name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-display text-3xl font-semibold text-slate/70 select-none tracking-wide">
                            {initials(p.Name)}
                          </span>
                        )}
                        {/* Durum rozeti */}
                        <span
                          className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 border rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide backdrop-blur-sm ${
                            active ? 'border-moss/40 bg-moss/15 text-moss' : 'border-slate/40 bg-charcoal/70 text-slate'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-moss' : 'bg-slate'}`} />
                          {active ? 'Aktif' : 'Pasif'}
                        </span>
                        {/* 86 / Tükendi rozeti (aktif ama satışa kapalı) */}
                        {active && !isAvailable(p) && (
                          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 border border-red-500/50 bg-red-500/20 text-red-500 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide backdrop-blur-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Tükendi
                          </span>
                        )}
                      </div>

                      {/* Bilgi alanı */}
                      <div className="p-4">
                        <p className="text-paper font-medium leading-tight truncate">{p.Name}</p>
                        {p.Description ? (
                          <p className="text-xs text-slate mt-1 line-clamp-2 min-h-[2rem]">{p.Description}</p>
                        ) : (
                          <p className="text-xs text-slate/50 mt-1 min-h-[2rem]">—</p>
                        )}

                        <div className="flex items-end justify-between mt-2">
                          <div>
                            <p className="font-display text-xl font-semibold text-paper leading-none">
                              {money(p.Price)}
                            </p>
                            {isAdmin && (
                              <p className="font-mono text-[10px] text-slate mt-1">
                                Maliyet: {p.Cost !== null && p.Cost !== undefined ? money(p.Cost) : '—'}
                                {p.VatRate !== null && p.VatRate !== undefined && (
                                  <span className="ml-2">· KDV %{p.VatRate}</span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>

                        {isAdmin && active && (
                          <button
                            onClick={() => toggleAvailability(p)}
                            className={`w-full font-mono text-[11px] uppercase tracking-wide rounded-sm py-2 mt-4 border transition-colors ${
                              isAvailable(p)
                                ? 'text-red-500 border-red-500/40 hover:bg-red-500/10'
                                : 'text-moss border-moss/40 hover:bg-moss/10'
                            }`}
                          >
                            {isAvailable(p) ? '🚫 Tükendi İşaretle' : '✅ Satışa Aç'}
                          </button>
                        )}

                        {isAdmin && (
                          <div className="flex gap-2 mt-2 pt-3 border-t border-hairline">
                            <button
                              onClick={() => setEditingProduct(p)}
                              className="flex-1 text-[11px] font-bold uppercase tracking-wide text-slate hover:text-paper border border-hairline rounded-xl py-2 transition-colors"
                            >
                              Düzenle
                            </button>
                            {active ? (
                              <button
                                onClick={() => deactivateProduct(p.ProductId)}
                                className="flex-1 text-[11px] font-bold uppercase tracking-wide text-[#FF6B6B] hover:text-white hover:bg-[#FF6B6B] border border-[#FF6B6B]/40 rounded-xl py-2 transition-all"
                              >
                                Pasife Al
                              </button>
                            ) : (
                              <button
                                onClick={() => reactivateProduct(p.ProductId)}
                                className="flex-1 text-[11px] font-bold uppercase tracking-wide text-moss hover:text-charcoal hover:bg-moss border border-moss/40 rounded-xl py-2 transition-colors"
                              >
                                Aktif Et
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <ProductModal
          title="Yeni Ürün"
          categories={categories}
          onClose={() => setShowCreateModal(false)}
          onSubmit={async (values) => {
            const res = await client.post('/products', values);
            return res.data;
          }}
          onSaved={() => {
            setShowCreateModal(false);
            fetchProducts();
          }}
        />
      )}

      {editingProduct && (
        <ProductModal
          title={`${editingProduct.Name} — Düzenle`}
          initial={editingProduct}
          categories={categories}
          onClose={() => setEditingProduct(null)}
          onSubmit={async (values) => {
            const res = await client.put(`/products/${editingProduct.ProductId}`, values);
            return { ...res.data, ProductId: editingProduct.ProductId };
          }}
          onSaved={() => {
            setEditingProduct(null);
            fetchProducts();
          }}
        />
      )}

      {importSummary && (
        <ImportSummaryModal summary={importSummary} onClose={() => setImportSummary(null)} />
      )}
    </div>
  );
}

// ============================================================
// İçe aktarma sonucu — kaç kategori/ürün eklendi/güncellendi + uyarılar
// (bkz. POST /products/import, controllers/dataTransferController.js).
// ============================================================
function ImportSummaryModal({ summary, onClose }) {
  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div
        className="bg-panel rounded-3xl border border-hairline w-full max-w-lg max-h-[85vh] overflow-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-hairline flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold text-[#FF6B6B] tracking-[0.2em] uppercase mb-1">Menü</p>
            <h2 className="font-display text-xl font-semibold text-paper">İçe Aktarma Tamamlandı</h2>
          </div>
          <button type="button" onClick={onClose} className="font-mono text-xs text-slate hover:text-paper">
            Kapat ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SummaryStat label="Kategori Eklendi" value={summary.categoriesCreated} />
            <SummaryStat label="Kategori Güncellendi" value={summary.categoriesUpdated} />
            <SummaryStat label="Ürün Eklendi" value={summary.productsCreated} />
            <SummaryStat label="Ürün Güncellendi" value={summary.productsUpdated} />
          </div>

          {summary.warnings?.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-amber-500 mb-2">
                Uyarılar ({summary.warnings.length})
              </p>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {summary.warnings.map((w, i) => (
                  <li key={i} className="font-mono text-[11px] text-slate border-l-2 border-amber-500/40 pl-2.5">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-hairline flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-wide text-white bg-[#FF6B6B]
                       hover:bg-[#ff5555] rounded-xl px-4 py-2.5 shadow-lg shadow-red-500/10 transition-all"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="border border-hairline rounded-sm px-3 py-2.5 bg-charcoal/40">
      <p className="font-mono text-[9px] uppercase tracking-wide text-slate">{label}</p>
      <p className="font-display text-xl font-semibold text-paper mt-0.5">{value}</p>
    </div>
  );
}
