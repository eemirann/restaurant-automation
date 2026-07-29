import { useState, useEffect } from 'react';
import client, { imageUrl } from '../api/client';
import OptionRow from './OptionRow';
import { calculateLineTotal, money } from '../utils/priceCalculator';
import { useLanguage } from '../i18n';

// Ürün kartına tıklanınca açılan özelleştirme pop-up'ı — beyaz/premium
// tasarım dili, restoran-panel'in koyu POS temasından bağımsız.
export default function ProductDetailModal({ qrToken, product, initialLine, onClose, onConfirm, onRemove, onOptionsLoaded }) {
  const { t } = useLanguage();
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
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[88vh] shadow-lift
                   flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center gap-3 p-4 border-b border-line shrink-0">
          <div className="relative w-16 h-16 rounded-xl bg-cream overflow-hidden shrink-0">
            {product.ImageUrl ? (
              <img src={imageUrl(product.ImageUrl)} alt={product.Name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl select-none">🍽️</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold text-ink leading-tight truncate">{product.Name}</h3>
            {product.Description && <p className="text-xs text-muted leading-snug line-clamp-1">{product.Description}</p>}
            <span className="text-sm text-gold font-semibold">{money(product.Price)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-cream text-muted hover:text-ink transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold">{t('qty')}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 flex items-center justify-center text-base text-muted hover:text-ink
                           border border-line rounded-full select-none"
              >
                −
              </button>
              <span className="text-base text-ink font-medium w-6 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-9 h-9 flex items-center justify-center text-base text-paper bg-ink
                           hover:bg-ink/85 rounded-full select-none"
              >
                +
              </button>
            </div>
          </div>

          {loadingOptions ? (
            <p className="text-xs text-muted">{t('loadingOptions')}</p>
          ) : (
            <>
              {extrasCatalog.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-1.5">{t('extras')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {extrasCatalog.map((extra) => (
                      <div key={extra.ProductId} className="border border-line rounded-xl bg-cream/60">
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
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-1.5">{t('syrups')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {syrupsCatalog.map((syrup) => (
                      <div key={syrup.ProductId} className="border border-line rounded-xl bg-cream/60">
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

        <div className="shrink-0 border-t border-line p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-[0.2em] text-muted font-semibold">{t('total')}</span>
            <span className="text-lg text-ink font-semibold">{money(total)}</span>
          </div>
          <div className="flex items-center gap-2">
            {initialLine && (
              <button
                type="button"
                onClick={onRemove}
                className="text-xs uppercase tracking-[0.15em] font-semibold text-muted hover:text-danger px-4 py-3 min-h-[2.75rem]"
              >
                {t('removeFromCart')}
              </button>
            )}
            <button
              type="button"
              onClick={() => onConfirm({ quantity, extras, syrups })}
              className="flex-1 text-sm uppercase tracking-[0.15em] font-semibold text-paper bg-ink
                         hover:bg-ink/90 active:bg-ink/80 rounded-full px-6 py-3.5 min-h-[2.75rem] transition-colors"
            >
              {initialLine ? t('updateCart') : t('addToCart')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
