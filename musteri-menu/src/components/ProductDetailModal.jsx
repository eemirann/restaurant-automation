import { useState, useEffect } from 'react';
import client, { imageUrl } from '../api/client';
import OptionRow from './OptionRow';
import { calculateLineTotal, money } from '../utils/priceCalculator';

// Ürün kartına tıklanınca açılan özelleştirme pop-up'ı — restoran-panel'deki
// ProductDetailModal'ın (kompakt, scroll'suz) müşteri tarafı karşılığı.
export default function ProductDetailModal({ qrToken, product, initialLine, onClose, onConfirm, onRemove, onOptionsLoaded }) {
  const [quantity, setQuantity] = useState(initialLine?.quantity || 1);
  const [extras, setExtras] = useState(initialLine?.extras || {});
  const [syrups, setSyrups] = useState(initialLine?.syrups || {});
  const [options, setOptions] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    let active = true;
    client.get(`/public/menu/${qrToken}/options/${product.ProductId}`)
      .then((res) => {
        if (!active) return;
        setOptions(res.data);
        // Üst bileşen (MenuApp) sepet toplamını doğru hesaplayabilsin diye
        // bu ürünün ekstra/şurup kataloğunu önbelleğe alır.
        onOptionsLoaded?.(product.ProductId, res.data);
      })
      .catch(() => { if (active) setOptions({ extras: [], syrups: [] }); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, [qrToken, product.ProductId, onOptionsLoaded]);

  if (!product) return null;

  const extrasCatalog = options?.extras || [];
  const syrupsCatalog = options?.syrups || [];
  const extrasCatalogMap = new Map(extrasCatalog.map((o) => [o.ProductId, o]));
  const syrupsCatalogMap = new Map(syrupsCatalog.map((o) => [o.ProductId, o]));

  const total = calculateLineTotal(product.Price, quantity, [
    { selections: extras, catalogById: extrasCatalogMap },
    { selections: syrups, catalogById: syrupsCatalogMap },
  ]);

  const bumpOption = (setter, id, delta) => {
    setter((prev) => {
      const next = (prev[id] || 0) + delta;
      const clone = { ...prev };
      if (next <= 0) delete clone[id];
      else clone[id] = next;
      return clone;
    });
  };

  return (
    <div className="fixed inset-0 bg-ink/70 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-panel rounded-t-2xl sm:rounded-2xl border border-hairline w-full sm:max-w-lg max-h-[88vh] shadow-2xl
                   flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center gap-3 p-3 border-b border-hairline shrink-0">
          <div className="relative w-16 h-16 rounded-lg bg-hairline/40 overflow-hidden shrink-0">
            {product.ImageUrl ? (
              <img src={imageUrl(product.ImageUrl)} alt={product.Name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl select-none">🍽️</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold text-paper leading-tight truncate">{product.Name}</h3>
            {product.Description && <p className="text-xs text-slate leading-snug line-clamp-1">{product.Description}</p>}
            <span className="font-mono text-sm text-ember font-semibold">{money(product.Price)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-hairline/60 text-slate hover:text-paper transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-[11px] uppercase tracking-wide text-slate">Adet</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 flex items-center justify-center font-mono text-base text-slate hover:text-ember
                           border border-hairline rounded-full select-none"
              >
                −
              </button>
              <span className="font-mono text-base text-paper w-6 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-9 h-9 flex items-center justify-center font-mono text-base text-cream bg-ember
                           hover:bg-ember/90 rounded-full select-none"
              >
                +
              </button>
            </div>
          </div>

          {loadingOptions ? (
            <p className="font-mono text-xs text-slate">Seçenekler yükleniyor...</p>
          ) : (
            <>
              {extrasCatalog.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-slate mb-1">Ekstralar</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {extrasCatalog.map((extra) => (
                      <div key={extra.ProductId} className="border border-hairline rounded-lg">
                        <OptionRow
                          option={extra}
                          quantity={extras[extra.ProductId] || 0}
                          onIncrement={() => bumpOption(setExtras, extra.ProductId, 1)}
                          onDecrement={() => bumpOption(setExtras, extra.ProductId, -1)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {syrupsCatalog.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-slate mb-1">Şuruplar</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {syrupsCatalog.map((syrup) => (
                      <div key={syrup.ProductId} className="border border-hairline rounded-lg">
                        <OptionRow
                          option={syrup}
                          quantity={syrups[syrup.ProductId] || 0}
                          onIncrement={() => bumpOption(setSyrups, syrup.ProductId, 1)}
                          onDecrement={() => bumpOption(setSyrups, syrup.ProductId, -1)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-hairline p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs uppercase tracking-wide text-slate">Toplam</span>
            <span className="font-mono text-lg text-paper font-semibold">{money(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            {initialLine && (
              <button
                type="button"
                onClick={onRemove}
                className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember px-4 py-3 min-h-[2.75rem]"
              >
                Sepetten Çıkar
              </button>
            )}
            <button
              type="button"
              onClick={() => onConfirm({ quantity, extras, syrups })}
              className="flex-1 font-mono text-sm uppercase tracking-wide text-cream bg-ember
                         hover:bg-ember/90 active:bg-ember/80 rounded-full px-6 py-3 min-h-[2.75rem] transition-colors"
            >
              {initialLine ? 'Sepeti Güncelle' : 'Sepete Ekle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
