import { motion } from 'framer-motion';
import { imageUrl } from '../api/client';
import { productEmoji } from '../utils/productEmoji';
import { isProductAvailable } from '../utils/productAvailability';

const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

// Premium POS ürün kartı — sipariş ekranının ürün ızgarasında kullanılır.
// Tıklama, ürünü doğrudan sepete eklemez; ProductDetailModal'ı açar
// (bkz. TableOrderCart in Tables.jsx).
const LOW_STOCK_THRESHOLD = 5;

export default function ProductCard({ product, quantity = 0, onOpen }) {
  const hasStockCount = product.StockCount !== null && product.StockCount !== undefined;
  const avail = isProductAvailable(product);
  const lowStock = avail && hasStockCount && Number(product.StockCount) <= LOW_STOCK_THRESHOLD;
  const popular = product.IsPopular === true || product.IsPopular === 1;

  return (
    <motion.button
      type="button"
      onClick={() => onOpen(product)}
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      whileHover={avail ? { y: -3, scale: 1.015 } : undefined}
      whileTap={avail ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`group relative flex flex-col text-left rounded-2xl border bg-panel overflow-hidden
                  shadow-sm hover:shadow-lg transition-shadow duration-200
                  ${avail ? 'border-hairline cursor-pointer' : 'border-hairline opacity-60 cursor-pointer'}`}
    >
      {/* Görsel */}
      <div className="relative w-full aspect-square bg-hairline/30 overflow-hidden">
        {product.ImageUrl ? (
          <img
            src={imageUrl(product.ImageUrl)}
            alt={product.Name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl select-none">
            {productEmoji(product.Name)}
          </div>
        )}

        {/* Rozetler — bu kart SADECE sipariş başlatma ekranında kullanılıyor,
            Superdesign'ın "Kahve Mağazası" spesifikasyonuna göre turuncu/kırmızı. */}
        <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
          {popular && (
            <span className="font-mono text-[9px] uppercase tracking-wide bg-[#D97706] text-white rounded-full px-2 py-0.5 shadow-sm">
              ⭐ Popüler
            </span>
          )}
          {avail && lowStock && (
            <span className="font-mono text-[9px] uppercase tracking-wide bg-azure text-cream rounded-full px-2 py-0.5 shadow-sm">
              Son {product.StockCount} adet
            </span>
          )}
        </div>

        {!avail && (
          <div className="absolute inset-0 bg-ink/50 flex items-center justify-center">
            <span className="font-mono text-[10px] uppercase tracking-wide text-cream border border-cream/50 rounded-full px-2.5 py-1">
              Tükendi
            </span>
          </div>
        )}

        {quantity > 0 && (
          <span className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-[#EF4444] text-white font-mono text-[11px] font-semibold shadow-sm">
            {quantity}
          </span>
        )}
      </div>

      {/* İçerik */}
      <div className="flex-1 flex flex-col p-3 gap-0.5">
        <p className="font-display text-sm font-semibold text-paper leading-snug truncate">
          {product.Name}
        </p>
        {product.Description && (
          <p className="text-xs text-slate line-clamp-2 leading-snug">{product.Description}</p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-[#D97706]">{money(product.Price)}</span>
          {avail && (
            <span
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#EF4444] text-white
                         text-sm font-semibold shadow-sm group-hover:bg-red-600 transition-colors"
            >
              +
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
