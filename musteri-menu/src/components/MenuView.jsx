import { useState } from 'react';
import { imageUrl } from '../api/client';
import { money } from '../utils/priceCalculator';
import { useLanguage } from '../i18n';

// Menü listeleme: kategori filtresi + arama + ürün ızgarası.
// Premium/beyaz tasarım dili — büyük fotoğraflar, yumuşak gölgeler, ince
// bronz vurgu (bkz. tailwind.config.js: ink/paper/cream/line/muted/gold).
export default function MenuView({ tableNumber, categories, products, cart, onOpenProduct, logoUrl, restaurantName }) {
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');

  const visibleProducts = products
    .filter((p) => (activeCategory === 'all' ? true : String(p.CategoryId) === String(activeCategory)))
    .filter((p) => (normalizedSearch ? p.Name.toLocaleLowerCase('tr-TR').includes(normalizedSearch) : true));

  const popular = products.filter((p) => p.IsPopular === true || p.IsPopular === 1).slice(0, 4);

  return (
    <div className="pb-4">
      <div className="px-5 pt-6">
        {logoUrl && (
          <img src={imageUrl(logoUrl)} alt={restaurantName || ''} className="max-h-14 max-w-[60%] object-contain mb-3" />
        )}
        <p className="text-[11px] uppercase tracking-[0.25em] text-gold font-semibold mb-1.5">{t('table', { n: tableNumber })}</p>
        <h1 className="font-display text-3xl font-semibold text-ink mb-4 leading-tight">{t('menuTitle')}</h1>

        <div className="relative mb-5">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted text-sm">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full border border-line rounded-full pl-10 pr-4 py-3 bg-cream text-ink text-sm placeholder:text-muted
                       focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold transition-shadow"
          />
        </div>
      </div>

      {!normalizedSearch && popular.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold px-5 mb-2.5">{t('popularNow')}</p>
          <div className="flex gap-3.5 overflow-x-auto px-5 pb-1 snap-x">
            {popular.map((p) => (
              <button
                key={p.ProductId}
                type="button"
                onClick={() => onOpenProduct(p)}
                className="shrink-0 w-44 text-left snap-start group"
              >
                <div className="w-44 h-32 rounded-2xl bg-cream overflow-hidden mb-2 shadow-card">
                  {p.ImageUrl ? (
                    <img src={imageUrl(p.ImageUrl)} alt={p.Name} className="w-full h-full object-cover transition-transform group-active:scale-95" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
                  )}
                </div>
                <p className="text-sm text-ink font-semibold truncate">{p.Name}</p>
                <p className="text-xs text-gold font-medium mt-0.5">{money(p.Price)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto px-5 mb-5 pb-1">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`shrink-0 text-xs uppercase tracking-[0.15em] font-semibold px-4 py-2.5 rounded-full border transition-colors ${
            activeCategory === 'all' ? 'bg-ink text-paper border-ink' : 'border-line text-muted'
          }`}
        >
          {t('all')}
        </button>
        {categories.map((c) => (
          <button
            key={c.CategoryId}
            type="button"
            onClick={() => setActiveCategory(c.CategoryId)}
            className={`shrink-0 text-xs uppercase tracking-[0.15em] font-semibold px-4 py-2.5 rounded-full border transition-colors ${
              String(activeCategory) === String(c.CategoryId) ? 'bg-ink text-paper border-ink' : 'border-line text-muted'
            }`}
          >
            {c.Name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3.5 px-5">
        {visibleProducts.length === 0 ? (
          <p className="col-span-2 text-center text-muted text-sm py-10">{t('noProducts')}</p>
        ) : (
          visibleProducts.map((p) => {
            const qty = cart[p.ProductId]?.quantity || 0;
            return (
              <button
                key={p.ProductId}
                type="button"
                onClick={() => onOpenProduct(p)}
                className="relative text-left rounded-2xl bg-white overflow-hidden shadow-card hover:shadow-lift transition-shadow"
              >
                <div className="w-full aspect-square bg-cream overflow-hidden">
                  {p.ImageUrl ? (
                    <img src={imageUrl(p.ImageUrl)} alt={p.Name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                  )}
                </div>
                {qty > 0 && (
                  <span className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-full bg-ink text-paper text-[11px] font-semibold shadow">
                    {qty}
                  </span>
                )}
                <div className="p-3">
                  <p className="text-sm text-ink font-semibold leading-snug truncate">{p.Name}</p>
                  <p className="text-xs text-gold font-medium mt-1">{money(p.Price)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
