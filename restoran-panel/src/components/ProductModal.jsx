import { useEffect, useState } from 'react';
import client, { imageUrl } from '../api/client';
import ProductOptionSelector from './ProductOptionSelector';

// Ürün oluşturma / düzenleme formu (Admin). Düzenleme modunda (initial.ProductId
// varken) "İzin Verilen Ekstralar/Şuruplar" bölümleri de gösterilir — hangi
// ekstra/şurubun bu üründe sipariş ekranında seçilebilir olacağını yönetir
// (bkz. ProductOptionSelector, controllers/productController.js:getProductOptions).
// Yeni ürün oluştururken bu bölüm gösterilmez: henüz bir ProductId yok, önce
// ürün kaydedilip düzenleme moduna geçilmesi gerekir (resim yüklemede de aynı desen kullanılıyor).
export default function ProductModal({ title, initial, categories, onClose, onSubmit, onSaved }) {
  const [name, setName] = useState(initial?.Name ?? '');
  const [description, setDescription] = useState(initial?.Description ?? '');
  const [price, setPrice] = useState(initial?.Price ?? '');
  const [cost, setCost] = useState(initial?.Cost ?? '');
  const [vatRate, setVatRate] = useState(initial?.VatRate ?? '');
  const [categoryId, setCategoryId] = useState(initial?.CategoryId ?? '');
  const [isPopular, setIsPopular] = useState(initial?.IsPopular === true || initial?.IsPopular === 1);
  const [barcode, setBarcode] = useState(initial?.Barcode ?? '');
  const [stockCount, setStockCount] = useState(initial?.StockCount ?? '');
  const [loyaltyPointCost, setLoyaltyPointCost] = useState(initial?.LoyaltyPointCost ?? '');
  const [imageFile, setImageFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const productId = initial?.ProductId;

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [extrasCatalog, setExtrasCatalog] = useState([]);
  const [syrupsCatalog, setSyrupsCatalog] = useState([]);
  const [selectedExtras, setSelectedExtras] = useState(new Map());
  const [selectedSyrups, setSelectedSyrups] = useState(new Map());

  // Stok Takibi — VARSAYILAN KAPALI: menü ürünleri normalde stokta hiç
  // görünmez (reçete/hammadde bazlı takip edilir). Ama dolapta hazır
  // bekleyen (ör. şişe/kutu soğuk içecek gibi reçetesiz satılan) ürünler
  // için bu düğmeyle İSTEĞE BAĞLI olarak açılabilir (bkz. controllers/
  // stockController.js: getStockByProduct/createStockItem).
  const [stockInfo, setStockInfo] = useState(null); // { StockId, Quantity, IsTracked } | null
  const [stockLoading, setStockLoading] = useState(false);
  const [stockToggling, setStockToggling] = useState(false);
  const [stockError, setStockError] = useState('');

  useEffect(() => {
    if (!productId) return;
    setStockLoading(true);
    client
      .get(`/stock/product/${productId}`)
      .then((res) => setStockInfo(res.data))
      .catch(() => setStockInfo(null))
      .finally(() => setStockLoading(false));
  }, [productId]);

  const stockTracked = !!stockInfo && stockInfo.IsTracked;

  const toggleStockTracking = async () => {
    setStockError('');
    setStockToggling(true);
    try {
      if (stockTracked) {
        await client.delete(`/stock/${stockInfo.StockId}`);
        setStockInfo({ ...stockInfo, IsTracked: false });
      } else if (stockInfo) {
        await client.patch(`/stock/${stockInfo.StockId}/reactivate`);
        setStockInfo({ ...stockInfo, IsTracked: true });
      } else {
        const res = await client.post('/stock', { ProductId: productId, Quantity: 0, MinStockLevel: 5 });
        setStockInfo({ StockId: res.data.StockId, Quantity: res.data.Quantity, IsTracked: true });
      }
    } catch (err) {
      setStockError(err.response?.data?.error || 'Stok takibi değiştirilemedi.');
    } finally {
      setStockToggling(false);
    }
  };

  useEffect(() => {
    if (!productId) return;
    setOptionsLoading(true);
    client
      .get(`/products/${productId}/options`)
      .then((res) => {
        setExtrasCatalog(res.data.extras);
        setSyrupsCatalog(res.data.syrups);
        setSelectedExtras(
          new Map(
            res.data.extras
              .filter((e) => e.Attached)
              .map((e) => [e.ProductId, { IsEnabled: !!e.IsEnabled, DisplayOrder: e.DisplayOrder }])
          )
        );
        setSelectedSyrups(
          new Map(
            res.data.syrups
              .filter((s) => s.Attached)
              .map((s) => [s.ProductId, { IsEnabled: !!s.IsEnabled, DisplayOrder: s.DisplayOrder }])
          )
        );
      })
      .catch(() => {})
      .finally(() => setOptionsLoading(false));
  }, [productId]);

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
    if (vatRate !== '' && (Number(vatRate) < 0 || Number(vatRate) > 100)) {
      setError('KDV oranı 0-100 arasında olmalıdır.');
      return;
    }
    if (stockCount !== '' && Number(stockCount) < 0) {
      setError('Stok adedi negatif olamaz.');
      return;
    }
    if (loyaltyPointCost !== '' && (!Number.isInteger(Number(loyaltyPointCost)) || Number(loyaltyPointCost) < 0)) {
      setError('Puan bedeli negatif olmayan bir tam sayı olmalıdır.');
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
        VatRate: vatRate !== '' ? Number(vatRate) : null,
        IsPopular: isPopular,
        Barcode: barcode.trim() || null,
        StockCount: stockCount !== '' ? Number(stockCount) : null,
        LoyaltyPointCost: loyaltyPointCost !== '' ? Number(loyaltyPointCost) : null,
      });

      const savedId = saved?.ProductId ?? productId;

      if (imageFile && savedId) {
        const formData = new FormData();
        formData.append('image', imageFile);
        await client.post(`/products/${savedId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      if (productId) {
        await client.put(`/products/${productId}/options`, {
          Extras: [...selectedExtras.entries()].map(([ExtraProductId, v]) => ({
            ExtraProductId,
            DisplayOrder: v.DisplayOrder,
            IsEnabled: v.IsEnabled,
          })),
          Syrups: [...selectedSyrups.entries()].map(([SyrupProductId, v]) => ({
            SyrupProductId,
            DisplayOrder: v.DisplayOrder,
            IsEnabled: v.IsEnabled,
          })),
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

          <div className="flex gap-3">
            <div className="flex-1">
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
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                KDV Oranı (%) <span className="normal-case text-slate/70">(opsiyonel)</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                placeholder="Genel oran (Ayarlar)"
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
          </div>
          <p className="font-mono text-[11px] text-slate -mt-2">
            Boş bırakılırsa Ayarlar &gt; Vergi sayfasındaki genel KDV oranı kullanılır. Farklı bir oran
            (ör. alkollü içecek %20) gerekiyorsa buraya girin — fatura kesilirken bu ürün için geçerli olur.
          </p>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">Barkod (opsiyonel)</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="ör. 8690123456789"
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
            <div className="flex-1">
              <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
                Stok Adedi <span className="normal-case text-slate/70">(opsiyonel)</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={stockCount}
                onChange={(e) => setStockCount(e.target.value)}
                placeholder="Sınırsız"
                className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper
                           focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
              />
            </div>
          </div>

          {productId ? (
            <div className="border border-hairline rounded-sm px-3 py-3 bg-hairline/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wide text-paper">📦 Stok Takibi</p>
                  <p className="font-mono text-[11px] text-slate mt-0.5">
                    Kapalıysa bu ürün stokta hiç görünmez (reçeteyle takip edilir). Dolapta hazır bekleyen,
                    reçetesiz satılan ürünler (ör. şişe/kutu soğuk içecek) için açabilirsiniz.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleStockTracking}
                  disabled={stockLoading || stockToggling}
                  role="switch"
                  aria-checked={stockTracked}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                    stockTracked ? 'bg-ember' : 'bg-hairline'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-cream shadow-sm transition-transform ${
                      stockTracked ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {stockTracked && (
                <p className="font-mono text-[11px] text-moss mt-2">
                  Açık — mevcut adet: {stockInfo?.Quantity ?? 0}. Adedi değiştirmek için Stok sayfasını kullanın.
                </p>
              )}
              {stockError && <p className="text-ember text-xs font-medium mt-2">{stockError}</p>}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-slate bg-hairline/60 border border-hairline rounded-sm px-3 py-2">
              Stok takibi için önce ürünü kaydedin, ardından tekrar düzenleyin.
            </p>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPopular}
              onChange={(e) => setIsPopular(e.target.checked)}
              className="accent-ember w-4 h-4"
            />
            <span className="font-mono text-xs uppercase tracking-wide text-paper">⭐ Popüler olarak işaretle</span>
          </label>

          <div>
            <label className="block font-mono text-xs uppercase tracking-wide text-slate mb-1.5">
              Sadaklık Puanı Bedeli <span className="normal-case text-slate/70">(opsiyonel — dolu ise ürün puanla ücretsiz alınabilir)</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={loyaltyPointCost}
              onChange={(e) => setLoyaltyPointCost(e.target.value)}
              placeholder="ör. 100"
              className="w-full border border-hairline rounded-sm px-3 py-2.5 font-mono text-paper
                         focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
            />
          </div>

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

          {productId ? (
            <div className="space-y-4 pt-2 border-t border-hairline">
              {optionsLoading ? (
                <p className="text-slate font-mono text-xs">Opsiyonlar yükleniyor...</p>
              ) : (
                <>
                  <ProductOptionSelector
                    title="İzin Verilen Ekstralar"
                    catalog={extrasCatalog}
                    selected={selectedExtras}
                    onChange={setSelectedExtras}
                  />
                  <ProductOptionSelector
                    title="İzin Verilen Şuruplar"
                    catalog={syrupsCatalog}
                    selected={selectedSyrups}
                    onChange={setSelectedSyrups}
                  />
                </>
              )}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-slate bg-hairline/60 border border-hairline rounded-sm px-3 py-2">
              Ekstra/şurup seçimi için önce ürünü kaydedin, ardından tekrar düzenleyin.
            </p>
          )}

          {error && (
            <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3">{error}</p>
          )}
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
