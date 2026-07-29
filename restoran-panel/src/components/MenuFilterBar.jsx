// Sipariş ekranının ürün ızgarası üzerindeki arama çubuğu. Hızlı filtre
// çipleri (Popüler/Mevcut/Tükenen/Sepettekiler) artık burada değil — sol
// dikey rayda (bkz. Tables.jsx: TableOrderCart, QuickFilterRail) çünkü
// kategoriler yukarı yatay bara taşındı, hızlı filtreler sola alındı.
export default function MenuFilterBar({ searchTerm, onSearchChange }) {
  return (
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
  );
}
