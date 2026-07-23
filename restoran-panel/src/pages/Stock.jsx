import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Stock() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'Admin';

  // Veriler
  const [stockItems, setStockItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  // Arama / sıralama / filtre
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [statusFilter, setStatusFilter] = useState('all');

  // Yeni stok kalemi ekleme çekmecesi
  const [showAddDrawer, setShowAddDrawer] = useState(false);

  // Stok alımı çekmecesi ("Düzenle" butonu)
  const [purchaseItem, setPurchaseItem] = useState(null);

  // Stok listesini backend'den çek (basit fonksiyon, useCallback yok)
  const fetchStock = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get('/stock');
      setStockItems(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Stok listesi getirilemedi.');
    } finally {
      setLoading(false);
    }
  };

  // Sayfa ilk açıldığında stok ve ürün listesini getir
  useEffect(() => {
    fetchStock();
    client.get('/products').then((res) => setProducts(res.data)).catch(() => {});
  }, []);

  // Önce ürün adına göre ara (basit, memoization yok)
  let filteredItems = stockItems.filter((item) =>
    item.ProductName.toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'))
  );

  // Sonra duruma göre filtrele
  if (statusFilter === 'available') {
    filteredItems = filteredItems.filter((item) => item.Quantity > item.MinStockLevel);
  } else if (statusFilter === 'low') {
    filteredItems = filteredItems.filter((item) => item.Quantity > 0 && item.Quantity <= item.MinStockLevel);
  } else if (statusFilter === 'out') {
    filteredItems = filteredItems.filter((item) => item.Quantity <= 0);
  }

  // Son olarak sırala (orijinal listeyi bozmamak için kopyası üzerinde)
  filteredItems = [...filteredItems];
  if (sortBy === 'name-asc') {
    filteredItems.sort((a, b) => a.ProductName.localeCompare(b.ProductName, 'tr-TR'));
  } else if (sortBy === 'name-desc') {
    filteredItems.sort((a, b) => b.ProductName.localeCompare(a.ProductName, 'tr-TR'));
  } else if (sortBy === 'stock-asc') {
    filteredItems.sort((a, b) => a.Quantity - b.Quantity);
  } else if (sortBy === 'stock-desc') {
    filteredItems.sort((a, b) => b.Quantity - a.Quantity);
  } else if (sortBy === 'recent') {
    filteredItems.sort((a, b) => new Date(b.UpdatedAt) - new Date(a.UpdatedAt));
  }

  const outOfStockCount = stockItems.filter((item) => item.Quantity <= 0).length;
  const lowStockCount = stockItems.filter((item) => item.Quantity > 0 && item.Quantity <= item.MinStockLevel).length;

  // Stoğu 1 artır — hiçbir pencere/soru çıkmaz, direkt artırır.
  // Her artış otomatik olarak bir "IN" hareketi olarak kaydedilir (tarih/tür otomatik).
  const handleIncrease = async (item) => {
    setActionError('');
    try {
      await client.patch(`/stock/${item.StockId}/increase`, { amount: 1 });
      fetchStock();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Stok artırılamadı.');
    }
  };

  // Stoğu 1 azalt — hiçbir pencere/soru çıkmaz, direkt azaltır.
  // Her azalış otomatik olarak bir "OUT" hareketi olarak kaydedilir (tarih/tür otomatik).
  const handleDecrease = async (item) => {
    setActionError('');
    try {
      await client.patch(`/stock/${item.StockId}/decrease`, { amount: 1 });
      fetchStock();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Stok azaltılamadı.');
    }
  };

  // Stok kalemini sil
  const handleDelete = async (item) => {
    if (!window.confirm(`"${item.ProductName}" için stok kaydı silinsin mi?`)) return;
    setActionError('');
    try {
      await client.delete(`/stock/${item.StockId}`);
      fetchStock();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Stok kalemi silinemedi.');
    }
  };

  return (
    <div className="p-10">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-[0.3em] text-ember uppercase mb-2">
            Depo · Envanter
          </p>
          <h1 className="font-display text-3xl font-semibold text-ink">Stok Yönetimi</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchStock}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-sand rounded-sm px-3 py-2 transition-colors"
          >
            ↻ Yenile
          </button>
          <button
            onClick={() => navigate('/stock-movements')}
            className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember
                       border border-sand rounded-sm px-3 py-2 transition-colors"
          >
            🕘 Hareket Geçmişi
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowAddDrawer(true)}
              className="font-mono text-xs uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 rounded-sm px-4 py-2 transition-colors"
            >
              + Yeni Stok
            </button>
          )}
        </div>
      </div>

      {/* Durum özeti */}
      <div className="flex flex-wrap gap-6 mb-6 font-mono text-xs text-slate">
        <span><span className="text-ink font-semibold">{stockItems.length}</span> toplam ürün</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block bg-ember" />
          {lowStockCount} düşük stokta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block bg-slate" />
          {outOfStockCount} stokta yok
        </span>
      </div>

      {/* Arama / Sırala / Filtrele */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search product..."
          className="flex-1 min-w-[16rem] max-w-sm border border-sand rounded-sm px-4 py-2.5 font-body text-ink
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-sand rounded-sm px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-ink bg-white
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        >
          <option value="name-asc">Ürün Adı (A-Z)</option>
          <option value="name-desc">Ürün Adı (Z-A)</option>
          <option value="stock-asc">Stok (Az → Çok)</option>
          <option value="stock-desc">Stok (Çok → Az)</option>
          <option value="recent">Son Güncellenen</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-sand rounded-sm px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-ink bg-white
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        >
          <option value="all">Tümü</option>
          <option value="available">Yeterli</option>
          <option value="low">Düşük Stok</option>
          <option value="out">Stokta Yok</option>
        </select>
      </div>

      {(error || actionError) && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-6">
          {error || actionError}
        </p>
      )}

      {loading ? (
        <p className="text-slate font-mono text-sm">Yükleniyor...</p>
      ) : filteredItems.length === 0 ? (
        <div className="border border-dashed border-sand rounded-sm p-10 text-center bg-white/50">
          <p className="text-slate font-mono text-sm">Gösterilecek stok kaydı bulunamadı.</p>
        </div>
      ) : (
        <div className="border border-sand rounded-sm overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream/60 border-b border-sand text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="px-5 py-3">Ürün</th>
                <th className="px-5 py-3">Adet</th>
                <th className="px-5 py-3">Min. Stok</th>
                <th className="px-5 py-3">Durum</th>
                {isAdmin && <th className="px-5 py-3 text-right">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isOut = item.Quantity <= 0;
                const isLow = !isOut && item.Quantity <= item.MinStockLevel;
                const statusLabel = isOut ? 'Stokta Yok' : isLow ? 'Düşük Stok' : 'Yeterli';
                const statusBadgeClass = isOut
                  ? 'border-slate/40 bg-slate/5'
                  : isLow
                  ? 'border-ember/40 bg-ember/5'
                  : 'border-moss/40 bg-moss/5';
                const statusDotClass = isOut ? 'bg-slate' : isLow ? 'bg-ember' : 'bg-moss';
                return (
                  <tr key={item.StockId} className="border-b border-sand last:border-b-0 hover:bg-cream/30">
                    <td className="px-5 py-3 text-ink font-medium">{item.ProductName}</td>
                    <td className="px-5 py-3 font-mono text-ink">{item.Quantity}</td>
                    <td className="px-5 py-3 font-mono text-slate">{item.MinStockLevel}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 border rounded-sm px-2 py-1 text-xs font-mono uppercase tracking-wide ${statusBadgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
                        {statusLabel}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        <div className="flex justify-end items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleDecrease(item)}
                            title="1 azalt"
                            className="w-8 h-8 flex items-center justify-center font-mono text-ink border border-sand rounded-sm
                                       hover:border-ember hover:text-ember transition-colors"
                          >
                            −
                          </button>
                          <button
                            onClick={() => handleIncrease(item)}
                            title="1 artır"
                            className="w-8 h-8 flex items-center justify-center font-mono text-cream bg-ember rounded-sm
                                       hover:bg-ember/90 transition-colors"
                          >
                            +
                          </button>
                          <button
                            onClick={() => setPurchaseItem(item)}
                            title="Stok alımı ekle"
                            className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-ember border border-sand rounded-sm px-2.5 py-1.5 transition-colors"
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="font-mono text-[11px] uppercase tracking-wide text-ember hover:text-ember/80 border border-ember/40 rounded-sm px-2.5 py-1.5 transition-colors"
                          >
                            Sil
                          </button>
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

      {/* Yeni stok kalemi ekleme çekmecesi (stoğu olan ürünler de seçilip düzenlenebilir) */}
      {showAddDrawer && (
        <StockAddDrawer
          products={products}
          stockItems={stockItems}
          onClose={() => setShowAddDrawer(false)}
          onSaved={() => {
            setShowAddDrawer(false);
            fetchStock();
          }}
        />
      )}

      {/* Stok alımı çekmecesi ("Düzenle" butonu) */}
      {purchaseItem && (
        <StockPurchaseDrawer
          item={purchaseItem}
          onClose={() => setPurchaseItem(null)}
          onSaved={() => {
            setPurchaseItem(null);
            fetchStock();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Yeni Stok Kalemi Ekleme Çekmecesi — StockPurchaseDrawer ile aynı
// sağdan kayan çekmece görünümü (tam ekran modal değil).
// Ürün ya listeden seçilir ya da yeni bir ürün adı yazılır (yeni bir
// "hammadde" olarak oluşturulur, menüde hiç görünmez). Girilen ilk
// adet de bir alım olarak kaydedilir (Birim Fiyat/Tedarikçi/Fatura/Not opsiyonel).
//
// Listeden zaten stoğu OLAN bir ürün seçilirse (ör. daha önce eklenmiş),
// yeni kayıt oluşturulmaz — bunun yerine mevcut stoğu üzerine adet eklenir
// (Düzenle butonundaki alım akışıyla aynı: POST /stock/:id/purchase).
// ============================================================
function StockAddDrawer({ products, stockItems, onClose, onSaved }) {
  const [productId, setProductId] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [minStockLevel, setMinStockLevel] = useState(5);
  const [unitPrice, setUnitPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Seçilen ürünün zaten bir stok kaydı var mı? Varsa "düzenleme" (mevcut
  // stoğa ekleme) moduna geçilir, minimum stok alanı gizlenir.
  const existingStock = productId
    ? stockItems.find((s) => s.ProductId === Number(productId))
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!productId && !newProductName.trim()) {
      setError('Listeden bir ürün seçin veya yeni bir ürün adı yazın.');
      return;
    }
    if (quantity < 0 || minStockLevel < 0) {
      setError('Adet ve minimum stok negatif olamaz.');
      return;
    }

    setSubmitting(true);
    try {
      if (existingStock) {
        // Zaten stoğu olan bir ürün seçildi -> mevcut stoğu düzenle (alım ekle)
        await client.post(`/stock/${existingStock.StockId}/purchase`, {
          Quantity: Number(quantity),
          UnitPrice: unitPrice ? Number(unitPrice) : undefined,
          Supplier: supplier.trim() || undefined,
          InvoiceNumber: invoiceNumber.trim() || undefined,
          Notes: notes.trim() || undefined,
        });
      } else {
        await client.post('/stock', {
          ProductId: productId ? Number(productId) : undefined,
          ProductName: productId ? undefined : newProductName.trim(),
          Quantity: Number(quantity),
          MinStockLevel: Number(minStockLevel),
          UnitPrice: unitPrice ? Number(unitPrice) : undefined,
          Supplier: supplier.trim() || undefined,
          InvoiceNumber: invoiceNumber.trim() || undefined,
          Notes: notes.trim() || undefined,
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
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Karartma */}
      <div className="absolute inset-0 bg-ink/50" onClick={() => !submitting && onClose()} />

      {/* Çekmece */}
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Başlık */}
        <div className="px-6 py-4 border-b border-sand flex items-start justify-between shrink-0 bg-white">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-ember uppercase mb-1">Stok</p>
            <h2 className="font-display text-lg font-semibold text-ink leading-tight">
              {existingStock ? 'Mevcut Stoğu Güncelle' : 'Yeni Stok Kalemi'}
            </h2>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="font-mono text-xs text-slate hover:text-ink w-9 h-9 flex items-center justify-center shrink-0 rounded-sm hover:bg-cream transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Gövde (kaydırılabilir) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 bg-cream/10 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ürün</label>
            <select
              value={productId}
              onChange={(e) => { setProductId(e.target.value); if (e.target.value) setNewProductName(''); }}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            >
              <option value="">Listeden seçin...</option>
              {products.map((p) => {
                const hasStock = stockItems.some((s) => s.ProductId === p.ProductId);
                return (
                  <option key={p.ProductId} value={p.ProductId}>
                    {p.Name}{hasStock ? ' — stokta var, üzerine eklenir' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {existingStock && (
            <p className="font-mono text-[11px] text-slate bg-cream/60 border border-sand rounded-sm px-3 py-2">
              Bu üründe zaten stok kaydı var (şu an {existingStock.Quantity} adet). Aşağıda girdiğin adet, mevcut stoğa <span className="text-ink font-semibold">eklenecek</span>.
            </p>
          )}

          {!existingStock && (
            <>
              <div className="flex items-center gap-2">
                <span className="flex-1 h-px bg-sand" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate">veya</span>
                <span className="flex-1 h-px bg-sand" />
              </div>

              <div>
                <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                  Yeni Ürün Adı <span className="normal-case text-slate/70">(menüde görünmez, sadece envanter için)</span>
                </label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => { setNewProductName(e.target.value); if (e.target.value) setProductId(''); }}
                  placeholder="ör. Süt, Kağıt Bardak..."
                  className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink bg-white
                             focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
                />
              </div>
            </>
          )}

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Adet</label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full border border-sand rounded-sm px-3 py-2.5 font-mono text-ink bg-white
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            {!existingStock && (
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Minimum Stok</label>
              <input
                type="number"
                min="0"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                className="w-full border border-sand rounded-sm px-3 py-2.5 font-mono text-ink bg-white
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            )}
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Birim Fiyat <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-mono text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Tedarikçi <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Fatura No <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Not <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-sm text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-white py-2">{error}</p>
          )}
        </form>

        {/* Alt aksiyon çubuğu */}
        <div className="px-6 py-4 border-t border-sand shrink-0 bg-white flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 font-mono text-xs uppercase tracking-wide text-slate hover:text-ink
                       border border-sand rounded-sm px-4 py-3 transition-colors disabled:opacity-50"
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

// ============================================================
// Stok Alımı Çekmecesi — Tables sayfasındaki PaymentDrawer ile aynı
// sağdan kayan çekmece görünümünü kullanır (tam ekran modal değil).
// "Düzenle" butonuna basınca açılır; kaydedince stok adedini artırır,
// StockPurchases'a kaydeder, çekmeceyi kapatır ve listeyi tazeler.
// ============================================================
function StockPurchaseDrawer({ item, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      setError('Adet pozitif bir tam sayı olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      await client.post(`/stock/${item.StockId}/purchase`, {
        Quantity: Number(quantity),
        UnitPrice: unitPrice ? Number(unitPrice) : undefined,
        Supplier: supplier.trim() || undefined,
        InvoiceNumber: invoiceNumber.trim() || undefined,
        Notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Stok alımı kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Karartma */}
      <div className="absolute inset-0 bg-ink/50" onClick={() => !submitting && onClose()} />

      {/* Çekmece */}
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        {/* Başlık */}
        <div className="px-6 py-4 border-b border-sand flex items-start justify-between shrink-0 bg-white">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-ember uppercase mb-1">Stok Alımı</p>
            <h2 className="font-display text-lg font-semibold text-ink leading-tight">{item.ProductName}</h2>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="font-mono text-xs text-slate hover:text-ink w-9 h-9 flex items-center justify-center shrink-0 rounded-sm hover:bg-cream transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Gövde (kaydırılabilir) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-6 py-5 bg-cream/10 space-y-4">
          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Ürün</label>
            <p className="text-ink font-medium bg-white border border-sand rounded-sm px-3 py-2.5">{item.ProductName}</p>
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Adet</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-mono text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Birim Fiyat <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-mono text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Tedarikçi <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Fatura No <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Not <span className="normal-case text-slate/70">(opsiyonel)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-sand rounded-sm px-3 py-2.5 font-body text-sm text-ink bg-white
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 bg-white py-2">{error}</p>
          )}
        </form>

        {/* Alt aksiyon çubuğu */}
        <div className="px-6 py-4 border-t border-sand shrink-0 bg-white flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 font-mono text-xs uppercase tracking-wide text-slate hover:text-ink
                       border border-sand rounded-sm px-4 py-3 transition-colors disabled:opacity-50"
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
