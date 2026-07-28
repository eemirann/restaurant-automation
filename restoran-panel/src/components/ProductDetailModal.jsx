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
          className="bg-panel rounded-xl border border-hairline w-full max-w-lg max-h-[92vh] shadow-2xl
                     flex flex-col overflow-hidden"
        >
          {/* Üst şerit: küçük görsel + isim/fiyat yan yana (sığdırmak için kompakt) */}
          <div className="relative flex items-center gap-3 p-3 border-b border-hairline shrink-0">
            <div className="relative w-16 h-16 rounded-lg bg-hairline/30 overflow-hidden shrink-0">
              {product.ImageUrl ? (
                <img src={imageUrl(product.ImageUrl)} alt={product.Name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl select-none">
                  {productEmoji(product.Name)}
                </div>
              )}
              {!avail && (
                <div className="absolute inset-0 bg-ink/50 flex items-center justify-center">
                  <span className="font-mono text-[8px] uppercase text-cream">Tükendi</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold text-paper leading-tight truncate">{product.Name}</h3>
              {product.Description && (
                <p className="text-xs text-slate leading-snug line-clamp-1">{product.Description}</p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-sm text-ember font-semibold">{money(product.Price)}</span>
                {avail && product.StockCount !== null && product.StockCount !== undefined && (
                  <span className="font-mono text-[10px] text-slate">· {product.StockCount} adet stokta</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="Kapat"
              className="w-8 h-8 flex items-center justify-center rounded-full shrink-0
                         bg-hairline/60 text-slate hover:text-paper transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          {/* Orta bölüm: adet + ekstra/şurup — sadece gerçekten sığmadığında kayar */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {/* Adet */}
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[11px] uppercase tracking-wide text-slate">Adet</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!avail}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 flex items-center justify-center font-mono text-base text-slate hover:text-ember
                             border border-hairline rounded-full select-none disabled:opacity-30"
                >
                  −
                </button>
                <span className="font-mono text-base text-paper w-6 text-center">{quantity}</span>
                <button
                  type="button"
                  disabled={!avail}
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-8 h-8 flex items-center justify-center font-mono text-base text-cream bg-ember
                             hover:bg-ember/90 rounded-full select-none disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>

            {/* Ekstra / Şurup — 2 sütunlu ızgara, dikey yer kaplamayı azaltır */}
            {optionsLoading ? (
              <p className="font-mono text-xs text-slate">Seçenekler yükleniyor...</p>
            ) : (
              <>
                {extrasCatalog.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wide text-slate mb-1">Ekstralar</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {extrasCatalog.map((extra) => (
                        <div key={extra.ProductId} className="border border-hairline rounded-lg">
                          <OptionCard
                            mode="order"
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
                          <OptionCard
                            mode="order"
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

          {/* Alt şerit: toplam + aksiyon butonları — her zaman sabit ve görünür */}
          <div className="shrink-0 border-t border-hairline p-3">
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
                disabled={!avail}
                onClick={confirm}
                className="flex-1 font-mono text-sm uppercase tracking-wide text-cream bg-ember
                           hover:bg-ember/90 active:bg-ember/80 disabled:opacity-40 disabled:cursor-not-allowed
                           rounded-full px-6 py-3 min-h-[2.75rem] transition-colors"
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
