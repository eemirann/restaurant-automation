const QUICK_FILTERS = [
  { value: 'all', label: 'Tümü' },
  { value: 'popular', label: '⭐ Popüler' },
  { value: 'available', label: 'Mevcut' },
  { value: 'outOfStock', label: 'Tükenen' },
];

// Sipariş ekranının ürün ızgarası üzerindeki arama çubuğu + hızlı filtre çipleri.
// Arama: isme göre anlık; barcode alanı henüz backend'de yoksa da kod hazır
// (Product.Barcode set edilirse otomatik eşleşir).
export default function MenuFilterBar({
  searchTerm,
  onSearchChange,
  quickFilter,
  onQuickFilterChange,
  cartFilter,
  onCartFilterChange,
  itemCount = 0,
}) {
  return (
    <div className="mb-3 space-y-2">
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate text-sm select-none">🔍</span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Ürün adı veya barkod ara..."
          className="w-full border border-hairline rounded-full pl-10 pr-9 py-3 min-h-[2.75rem] font-body text-sm text-paper
                     bg-panel focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember transition-shadow"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            title="Aramayı temizle"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center
                       rounded-full text-slate hover:text-ember hover:bg-hairline/60 transition-colors text-xs"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onQuickFilterChange(f.value)}
            className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-3.5 py-2 rounded-full border transition-colors whitespace-nowrap ${
              quickFilter === f.value
                ? 'border-ember bg-ember/10 text-ember font-semibold'
                : 'border-hairline text-slate hover:text-paper hover:border-paper/30'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px h-5 bg-hairline shrink-0 mx-1" />
        <button
          type="button"
          onClick={() => onCartFilterChange(cartFilter === 'inCart' ? 'all' : 'inCart')}
          className={`shrink-0 font-mono text-[11px] uppercase tracking-wide px-3.5 py-2 rounded-full border transition-colors whitespace-nowrap ${
            cartFilter === 'inCart'
              ? 'border-ember bg-ember/10 text-ember font-semibold'
              : 'border-hairline text-slate hover:text-paper hover:border-paper/30'
          }`}
        >
          Sepettekiler{itemCount > 0 ? ` (${itemCount})` : ''}
        </button>
      </div>
    </div>
  );
}
