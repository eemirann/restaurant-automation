import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { imageUrl } from '../api/client';
import { productEmoji } from '../utils/productEmoji';
import { isProductAvailable } from '../utils/productAvailability';
import OptionCard from './OptionCard';
import { calculateLineTotal } from './PriceCalculator';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

// Ürün ızgarasında bir karta tıklanınca açılan detay modalı. Ürünü doğrudan
// sepete eklemek yerine burada adet + ekstra/şurup seçilir, "Sepete Ekle" /
// "Sepeti Güncelle" ile tek seferde sepete yazılır (bkz. TableOrderCart).
export default function ProductDetailModal({
  product,
  initialLine,
  options,
  optionsLoading,
  onClose,
  onConfirm,
  onRemove,
}) {
  const [quantity, setQuantity] = useState(initialLine?.quantity || 1);
  const [extras, setExtras] = useState(initialLine?.extras || {});
  const [syrups, setSyrups] = useState(initialLine?.syrups || {});

  if (!product) return null;

  const avail = isProductAvailable(product);
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

  const confirm = () => {
    onConfirm({ quantity, extras, syrups });
  };

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-ink/50 flex items-center justify-center px-4 z-[60]"
        onClick={onClose}
      >
        <motion.div
          key="panel"
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="bg-panel rounded-xl border border-hairline w-full max-w-md max-h-[88vh] overflow-auto shadow-2xl"
        >
          <div className="relative w-full aspect-[16/10] bg-hairline/30">
            {product.ImageUrl ? (
              <img src={imageUrl(product.ImageUrl)} alt={product.Name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl select-none">
                {productEmoji(product.Name)}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Kapat"
              className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full
                         bg-ink/50 text-cream hover:bg-ink/70 transition-colors text-sm"
            >
              ✕
            </button>
            {!avail && (
              <span className="absolute bottom-3 left-3 font-mono text-[10px] uppercase tracking-wide text-cream bg-ink/60 border border-cream/40 rounded-full px-2.5 py-1">
                Tükendi
              </span>
            )}
          </div>

          <div className="p-5">
            <h3 className="font-display text-lg font-semibold text-paper leading-tight">{product.Name}</h3>
            {product.Description && <p className="text-sm text-slate mt-1 leading-snug">{product.Description}</p>}
            <p className="font-mono text-base text-ember font-semibold mt-2">{money(product.Price)}</p>
            {avail && product.StockCount !== null && product.StockCount !== undefined && (
              <p className="font-mono text-[11px] text-slate mt-1">Stokta {product.StockCount} adet kaldı</p>
            )}

            {/* Adet */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-hairline">
              <span className="font-mono text-[11px] uppercase tracking-wide text-slate">Adet</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!avail}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 flex items-center justify-center font-mono text-base text-slate hover:text-ember
                             border border-hairline rounded-full select-none disabled:opacity-30"
                >
                  −
                </button>
                <span className="font-mono text-base text-paper w-6 text-center">{quantity}</span>
                <button
                  type="button"
                  disabled={!avail}
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-9 h-9 flex items-center justify-center font-mono text-base text-cream bg-ember
                             hover:bg-ember/90 rounded-full select-none disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Ekstra / Şurup */}
            {optionsLoading ? (
              <p className="font-mono text-xs text-slate mt-4">Seçenekler yükleniyor...</p>
            ) : (
              <>
                {extrasCatalog.length > 0 && (
                  <div className="mt-4">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-slate mb-1.5">Ekstralar</p>
                    <div className="border border-hairline rounded-lg divide-y divide-hairline">
                      {extrasCatalog.map((extra) => (
                        <OptionCard
                          key={extra.ProductId}
                          mode="order"
                          option={extra}
                          quantity={extras[extra.ProductId] || 0}
                          onIncrement={() => bumpOption(setExtras, extra.ProductId, 1)}
                          onDecrement={() => bumpOption(setExtras, extra.ProductId, -1)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {syrupsCatalog.length > 0 && (
                  <div className="mt-4">
                    <p className="font-mono text-[11px] uppercase tracking-wide text-slate mb-1.5">Şuruplar</p>
                    <div className="border border-hairline rounded-lg divide-y divide-hairline">
                      {syrupsCatalog.map((syrup) => (
                        <OptionCard
                          key={syrup.ProductId}
                          mode="order"
                          option={syrup}
                          quantity={syrups[syrup.ProductId] || 0}
                          onIncrement={() => bumpOption(setSyrups, syrup.ProductId, 1)}
                          onDecrement={() => bumpOption(setSyrups, syrup.ProductId, -1)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-hairline">
              <span className="font-mono text-xs uppercase tracking-wide text-slate">Toplam</span>
              <span className="font-mono text-lg text-paper font-semibold">{money(total)}</span>
            </div>

            <div className="flex items-center gap-2 mt-4">
              {initialLine && (
                <button
                  type="button"
                  onClick={onRemove}
                  className="font-mono text-xs uppercase tracking-wide text-slate hover:text-ember px-4 py-3.5 min-h-[3rem]"
                >
                  Sepetten Çıkar
                </button>
              )}
              <button
                type="button"
                disabled={!avail}
                onClick={confirm}
                className="flex-1 font-mono text-sm uppercase tracking-wide text-cream bg-ember
                           hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                           rounded-full px-6 py-3.5 min-h-[3rem] transition-colors"
              >
                {initialLine ? 'Sepeti Güncelle' : 'Sepete Ekle'}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
