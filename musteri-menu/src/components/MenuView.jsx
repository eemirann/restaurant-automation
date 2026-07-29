import { useState } from 'react';
import { imageUrl } from '../api/client';
import { money } from '../utils/priceCalculator';

// Menü listeleme: kategori filtresi + arama + ürün ızgarası.
// Mockup'taki "Popular Right Now" / kategori sekmeleri ekranının karşılığı.
export default function MenuView({ tableNumber, categories, products, cart, onOpenProduct }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');

  const visibleProducts = products
    .filter((p) => (activeCategory === 'all' ? true : String(p.CategoryId) === String(activeCategory)))
    .filter((p) => (normalizedSearch ? p.Name.toLocaleLowerCase('tr-TR').includes(normalizedSearch) : true));

  const popular = products.filter((p) => p.IsPopular === true || p.IsPopular === 1).slice(0, 4);

  return (
    <div className="pb-4">
      <div className="px-4 pt-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-ember mb-1">Masa {tableNumber}</p>
        <h1 className="font-display text-2xl font-semibold text-paper mb-3">Menü</h1>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Menüde ara..."
          className="w-full border border-hairline rounded-full px-4 py-2.5 bg-panel text-paper text-sm mb-4
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />
      </div>

      {!normalizedSearch && popular.length > 0 && (
        <div className="mb-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate px-4 mb-2">Şu An Popüler</p>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x">
            {popular.map((p) => (
              <button
                key={p.ProductId}
                type="button"
                onClick={() => onOpenProduct(p)}
                className="shrink-0 w-40 text-left snap-start"
              >
                <div className="w-40 h-28 rounded-xl bg-hairline/40 overflow-hidden mb-1.5">
                  {p.ImageUrl ? (
                    <img src={imageUrl(p.ImageUrl)} alt={p.Name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
                  )}
                </div>
                <p className="text-sm text-paper font-medium truncate">{p.Name}</p>
                <p className="font-mono text-xs text-ember">{money(p.Price)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto px-4 mb-4 pb-1">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`shrink-0 font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border transition-colors ${
            activeCategory === 'all' ? 'bg-ember text-cream border-ember' : 'border-hairline text-slate'
          }`}
        >
          Tümü
        </button>
        {categories.map((c) => (
          <button
            key={c.CategoryId}
            type="button"
            onClick={() => setActiveCategory(c.CategoryId)}
            className={`shrink-0 font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border transition-colors ${
              String(activeCategory) === String(c.CategoryId) ? 'bg-ember text-cream border-ember' : 'border-hairline text-slate'
            }`}
          >
            {c.Name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4">
        {visibleProducts.length === 0 ? (
          <p className="col-span-2 text-center text-slate font-mono text-sm py-10">Ürün bulunamadı.</p>
        ) : (
          visibleProducts.map((p) => {
            const qty = cart[p.ProductId]?.quantity || 0;
            return (
              <button
                key={p.ProductId}
                type="button"
                onClick={() => onOpenProduct(p)}
                className="relative text-left border border-hairline rounded-xl bg-panel overflow-hidden hover:border-ember/40 transition-colors"
              >
                <div className="w-full aspect-square bg-hairline/40 overflow-hidden">
                  {p.ImageUrl ? (
                    <img src={imageUrl(p.ImageUrl)} alt={p.Name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🍽️</div>
                  )}
                </div>
                {qty > 0 && (
                  <span className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-ember text-cream font-mono text-[11px] font-semibold shadow">
                    {qty}
                  </span>
                )}
                <div className="p-2.5">
                  <p className="text-sm text-paper font-medium leading-snug truncate">{p.Name}</p>
                  <p className="font-mono text-xs text-ember mt-0.5">{money(p.Price)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
