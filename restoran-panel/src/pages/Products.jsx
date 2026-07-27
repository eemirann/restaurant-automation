import { useEffect, useState, useCallback } from 'react';
import client, { imageUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';

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
  const [actionError, setActionError] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

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

  const visibleProducts = products.filter((p) => {
    if (filter === 'active') return p.IsActive !== false && p.IsActive !== 0;
    if (filter === 'inactive') return p.IsActive === false || p.IsActive === 0;
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
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Menü · Mutfak
          </p>
          <h1 className="font-display text-3xl font-semibold text-paper">Ürünler</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchProducts}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-hairline rounded-sm px-3 py-2 transition-colors"
          >
            ↻ Yenile
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 rounded-sm px-4 py-2 transition-colors"
            >
              + Yeni Ürün
            </button>
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

      {/* Filtre sekmeleri */}
      <div className="flex gap-1 mb-6 border-b border-hairline">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`font-mono text-xs uppercase tracking-wide px-4 py-2.5 border-b-2 transition-colors ${
              filter === f.value
                ? 'border-ember text-paper font-semibold'
                : 'border-transparent text-slate hover:text-paper'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : visibleProducts.length === 0 ? (
        <div className="border border-dashed border-hairline rounded-sm p-10 text-center bg-panel/50">
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
                            {isAvailable(p) ? '🚫 86 — Tükendi İşaretle' : '✅ Satışa Aç'}
                          </button>
                        )}

                        {isAdmin && (
                          <div className="flex gap-2 mt-2 pt-3 border-t border-hairline">
                            <button
                              onClick={() => setEditingProduct(p)}
                              className="flex-1 font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember border border-hairline rounded-sm py-2 transition-colors"
                            >
                              Düzenle
                            </button>
                            {active ? (
                              <button
                                onClick={() => deactivateProduct(p.ProductId)}
                                className="flex-1 font-mono text-[11px] uppercase tracking-wide text-ember hover:text-cream hover:bg-ember border border-ember/40 rounded-sm py-2 transition-colors"
                              >
                                Pasife Al
                              </button>
                            ) : (
                              <button
                                onClick={() => reactivateProduct(p.ProductId)}
                                className="flex-1 font-mono text-[11px] uppercase tracking-wide text-moss hover:text-charcoal hover:bg-moss border border-moss/40 rounded-sm py-2 transition-colors"
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
        <ProductFormModal
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
        <ProductFormModal
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
    </div>
  );
}

// ============================================================
// Ürün oluşturma / düzenleme formu (Admin)
// ============================================================
function ProductFormModal({ title, initial, categories, onClose, onSubmit, onSaved }) {
  const [name, setName] = useState(initial?.Name ?? '');
  const [description, setDescription] = useState(initial?.Description ?? '');
  const [price, setPrice] = useState(initial?.Price ?? '');
  const [cost, setCost] = useState(initial?.Cost ?? '');
  const [categoryId, setCategoryId] = useState(initial?.CategoryId ?? '');
  const [imageFile, setImageFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Ürün adı zorunludur.');
      return;
    }
    if (!price || Number(price) <= 0) {
      setError('Fiyat pozitif bir sayı olmalıdır.');
      return;
    }
    if (!categoryId) {
      setError('Kategori seçmelisiniz.');
      return;
    }
    if (cost !== '' && Number(cost) < 0) {
      setError('Maliyet negatif olamaz.');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await onSubmit({
        Name: name.trim(),
        Description: description.trim() || undefined,
        Price: Number(price),
        CategoryId: Number(categoryId),
        Cost: cost !== '' ? Number(cost) : null,
      });

      if (imageFile && saved?.ProductId) {
        const formData = new FormData();
        formData.append('image', imageFile);
        await client.post(`/products/${saved.ProductId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'İşlem başarısız oldu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-panel rounded-sm border border-hairline w-full max-w-lg max-h-[85vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-hairline flex items-start justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Ürün</p>
            <h2 className="font-display text-xl font-semibold text-paper">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="font-mono text-xs text-slate hover:text-paper">
            Kapat ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ürün Adı</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Açıklama (opsiyonel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-sm text-paper
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Fiyat</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Kategori</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-body text-paper
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              >
                <option value="">Seçin</option>
                {categories.filter((c) => c.IsActive !== false && c.IsActive !== 0).map((c) => (
                  <option key={c.CategoryId} value={c.CategoryId}>{c.Name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Maliyet <span className="normal-case text-slate/70">(opsiyonel — Dashboard'daki kâr oranı için)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="ör. 12.50"
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
          )}

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ürün Fotoğrafı (opsiyonel)</label>
            <div className="flex items-center gap-3">
              {imageFile ? (
                <img src={URL.createObjectURL(imageFile)} alt="" className="w-14 h-14 object-cover rounded-sm border border-hairline" />
              ) : initial?.ImageUrl ? (
                <img src={imageUrl(initial.ImageUrl)} alt="" className="w-14 h-14 object-cover rounded-sm border border-hairline" />
              ) : (
                <div className="w-14 h-14 rounded-sm border border-dashed border-hairline flex items-center justify-center text-slate text-[10px] font-mono">
                  Yok
                </div>
              )}
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={(e) => setImageFile(e.target.files[0] || null)}
                className="flex-1 font-body text-xs text-paper file:mr-3 file:font-mono file:text-[11px] file:uppercase
                           file:border file:border-hairline file:rounded-sm file:px-2.5 file:py-1.5 file:bg-panel file:text-slate
                           hover:file:text-ember hover:file:border-ember"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-hairline flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-sm px-4 py-2.5 transition-colors"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                       hover:bg-ember/90 disabled:opacity-50 rounded-sm px-4 py-2.5 transition-colors"
          >
            {submitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
}
