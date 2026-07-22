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

  const visibleProducts = products.filter((p) => {
    if (filter === 'active') return p.IsActive !== false && p.IsActive !== 0;
    if (filter === 'inactive') return p.IsActive === false || p.IsActive === 0;
    return true;
  });

  const activeCount = products.filter((p) => p.IsActive !== false && p.IsActive !== 0).length;
  const inactiveCount = products.length - activeCount;

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Menü · Mutfak
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">Ürünler</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchProducts}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-sand rounded-sm px-3 py-2 transition-colors"
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
        <span><span className="text-ink font-semibold">{products.length}</span> toplam</span>
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
      <div className="flex gap-1 mb-6 border-b border-sand">
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

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : visibleProducts.length === 0 ? (
        <div className="border border-dashed border-sand rounded-sm p-10 text-center bg-white/50">
          <p className="text-slate font-mono text-sm">Gösterilecek ürün bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-sand rounded-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Ürün</th>
                <th className="px-5 py-3">Kategori</th>
                <th className="px-5 py-3">Fiyat</th>
                <th className="px-5 py-3">Durum</th>
                {isAdmin && <th className="px-5 py-3 text-right">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => {
                const active = p.IsActive !== false && p.IsActive !== 0;
                return (
                  <tr key={p.ProductId} className="border-b border-sand last:border-b-0 hover:bg-cream/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {p.ImageUrl ? (
                          <img
                            src={imageUrl(p.ImageUrl)}
                            alt={p.Name}
                            className="w-10 h-10 object-cover rounded-sm border border-sand"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-sm border border-dashed border-sand flex items-center justify-center text-slate text-[10px] font-mono">
                            —
                          </div>
                        )}
                        <div>
                          <p className="text-ink font-medium">{p.Name}</p>
                          {p.Description && <p className="text-xs text-slate mt-0.5">{p.Description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-ink font-mono text-xs">{categoryName(p.CategoryId)}</td>
                    <td className="px-5 py-3 font-mono text-ink">{money(p.Price)}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${
                          active ? 'border-moss/40 bg-moss/5' : 'border-slate/30 bg-slate/5'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-moss' : 'bg-slate'}`} />
                        {active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <button
                            onClick={() => setEditingProduct(p)}
                            className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember border border-sand rounded-sm px-2.5 py-1.5 transition-colors"
                          >
                            Düzenle
                          </button>
                          {active && (
                            <button
                              onClick={() => deactivateProduct(p.ProductId)}
                              className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2.5 py-1.5 transition-colors"
                            >
                              Pasife Al
                            </button>
                          )}
                          {!active && (
                            <button
                              onClick={() => reactivateProduct(p.ProductId)}
                              className="font-mono text-[11px] uppercase tracking-wide text-moss hover:text-moss/80 border border-moss/40 rounded-sm px-2.5 py-1.5 transition-colors"
                            >
                              Aktif Et
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
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

    setSubmitting(true);
    try {
      const saved = await onSubmit({
        Name: name.trim(),
        Description: description.trim() || undefined,
        Price: Number(price),
        CategoryId: Number(categoryId),
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
        className="bg-white rounded-sm border border-sand w-full max-w-lg max-h-[85vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-sand flex items-start justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-ember uppercase mb-1">Ürün</p>
            <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="font-mono text-xs text-slate hover:text-ink">
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
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Açıklama (opsiyonel)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-sm text-ink
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
                className="w-full border border-sand rounded-sm px-3 py-2.5 font-mono text-ink
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Kategori</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              >
                <option value="">Seçin</option>
                {categories.filter((c) => c.IsActive !== false && c.IsActive !== 0).map((c) => (
                  <option key={c.CategoryId} value={c.CategoryId}>{c.Name}</option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
          )}

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ürün Fotoğrafı (opsiyonel)</label>
            <div className="flex items-center gap-3">
              {imageFile ? (
                <img src={URL.createObjectURL(imageFile)} alt="" className="w-14 h-14 object-cover rounded-sm border border-sand" />
              ) : initial?.ImageUrl ? (
                <img src={imageUrl(initial.ImageUrl)} alt="" className="w-14 h-14 object-cover rounded-sm border border-sand" />
              ) : (
                <div className="w-14 h-14 rounded-sm border border-dashed border-sand flex items-center justify-center text-slate text-[10px] font-mono">
                  Yok
                </div>
              )}
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={(e) => setImageFile(e.target.files[0] || null)}
                className="flex-1 font-body text-xs text-ink file:mr-3 file:font-mono file:text-[11px] file:uppercase
                           file:border file:border-sand file:rounded-sm file:px-2.5 file:py-1.5 file:bg-white file:text-slate
                           hover:file:text-ember hover:file:border-ember"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-sand flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ink
                       border border-sand rounded-sm px-4 py-2.5 transition-colors"
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
