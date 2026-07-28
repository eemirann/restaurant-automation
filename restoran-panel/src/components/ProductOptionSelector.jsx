import { useMemo, useState } from 'react';
import OptionCard from './OptionCard';

// Aranabilir, çok seçimli checkbox listesi — ürün düzenleme ekranındaki
// "İzin Verilen Ekstralar" / "İzin Verilen Şuruplar" bölümleri için.
// `catalog`: /api/products/:id/options'tan gelen tam katalog (ör. tüm ekstralar).
// `selected`: Map<ProductId, {IsEnabled, DisplayOrder}> — bu ürüne bağlı olanlar.
// Attach/detach, sıralama (▲▼) ve etkinleştir/pasifleştir hepsi burada,
// tek bir onChange(nextSelectedMap) ile yönetilir; kaydetme üst formda olur.
export default function ProductOptionSelector({ title, catalog, selected, onChange }) {
  const [search, setSearch] = useState('');

  const attachedIds = useMemo(
    () => [...selected.entries()].sort((a, b) => a[1].DisplayOrder - b[1].DisplayOrder).map(([id]) => id),
    [selected]
  );

  const sortedCatalog = useMemo(() => {
    const attached = attachedIds.map((id) => catalog.find((c) => c.ProductId === id)).filter(Boolean);
    const unattached = catalog
      .filter((c) => !selected.has(c.ProductId))
      .sort((a, b) => a.Name.localeCompare(b.Name, 'tr-TR'));
    return [...attached, ...unattached];
  }, [catalog, attachedIds, selected]);

  const visible = sortedCatalog.filter((c) =>
    c.Name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))
  );

  const toggleAttach = (option) => {
    const next = new Map(selected);
    if (next.has(option.ProductId)) {
      next.delete(option.ProductId);
    } else {
      const maxOrder = attachedIds.length > 0 ? Math.max(...attachedIds.map((id) => selected.get(id).DisplayOrder)) : -1;
      next.set(option.ProductId, { IsEnabled: true, DisplayOrder: maxOrder + 1 });
    }
    onChange(next);
  };

  const toggleEnabled = (option) => {
    const current = selected.get(option.ProductId);
    if (!current) return;
    const next = new Map(selected);
    next.set(option.ProductId, { ...current, IsEnabled: !current.IsEnabled });
    onChange(next);
  };

  const move = (option, direction) => {
    const idx = attachedIds.indexOf(option.ProductId);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= attachedIds.length) return;

    const otherId = attachedIds[swapIdx];
    const next = new Map(selected);
    const a = next.get(option.ProductId);
    const b = next.get(otherId);
    next.set(option.ProductId, { ...a, DisplayOrder: b.DisplayOrder });
    next.set(otherId, { ...b, DisplayOrder: a.DisplayOrder });
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block font-mono text-xs uppercase tracking-wide text-slate">{title}</label>
        <span className="font-mono text-[10px] text-slate">{attachedIds.length} seçili</span>
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Ara..."
        className="w-full border border-hairline rounded-sm px-3 py-2 mb-2 font-body text-sm text-paper bg-panel
                   focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
      />
      <div className="border border-hairline rounded-sm max-h-56 overflow-auto divide-y divide-hairline">
        {visible.length === 0 ? (
          <p className="font-mono text-xs text-slate p-3">Sonuç bulunamadı.</p>
        ) : (
          visible.map((option) => {
            const attachedIdx = attachedIds.indexOf(option.ProductId);
            return (
              <OptionCard
                key={option.ProductId}
                mode="manage"
                option={option}
                attached={selected.has(option.ProductId)}
                enabled={selected.get(option.ProductId)?.IsEnabled ?? false}
                canMoveUp={attachedIdx > 0}
                canMoveDown={attachedIdx !== -1 && attachedIdx < attachedIds.length - 1}
                onToggleAttach={() => toggleAttach(option)}
                onToggleEnabled={() => toggleEnabled(option)}
                onMoveUp={() => move(option, -1)}
                onMoveDown={() => move(option, 1)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
