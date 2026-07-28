const money = (n) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);

// Tek bir ekstra/şurup satırı. İki modu var:
//  - "manage": ürün düzenleme ekranındaki checkbox listesi (attach/detach +
//    sıralama + etkinleştir/pasifleştir) — bkz. ProductOptionSelector.
//  - "order": POS sepetindeki adet seçici (bkz. Tables.jsx TableOrderCart).
export default function OptionCard({
  option,
  mode,
  attached,
  enabled,
  canMoveUp,
  canMoveDown,
  onToggleAttach,
  onToggleEnabled,
  onMoveUp,
  onMoveDown,
  quantity,
  onIncrement,
  onDecrement,
}) {
  const inactive = option.IsActive === false || option.IsActive === 0;

  if (mode === 'order') {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm text-paper truncate">{option.Name}</p>
          <p className="font-mono text-[11px] text-slate">+{money(option.Price)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onDecrement}
            disabled={!quantity}
            className="w-8 h-8 flex items-center justify-center font-mono text-sm text-slate hover:text-ember
                       border border-hairline rounded-sm select-none disabled:opacity-30"
          >
            −
          </button>
          <span className="font-mono text-sm text-paper w-4 text-center select-none">{quantity || 0}</span>
          <button
            type="button"
            onClick={onIncrement}
            className="w-8 h-8 flex items-center justify-center font-mono text-sm text-cream bg-ember
                       hover:bg-ember/90 rounded-sm select-none"
          >
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
        <input
          type="checkbox"
          checked={attached}
          onChange={onToggleAttach}
          className="accent-ember w-4 h-4 shrink-0"
        />
        <span className={`text-sm truncate ${inactive ? 'text-slate/60' : 'text-paper'}`}>
          {option.Name}
          {inactive ? ' (pasif)' : ''}
        </span>
      </label>
      <span className="font-mono text-[11px] text-slate shrink-0">+{money(option.Price)}</span>
      {attached && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Yukarı taşı"
            className="w-6 h-6 flex items-center justify-center text-xs text-slate hover:text-ember disabled:opacity-20"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Aşağı taşı"
            className="w-6 h-6 flex items-center justify-center text-xs text-slate hover:text-ember disabled:opacity-20"
          >
            ▼
          </button>
          <button
            type="button"
            onClick={onToggleEnabled}
            title={enabled ? 'Sipariş ekranından gizle' : 'Sipariş ekranında göster'}
            className={`font-mono text-[10px] uppercase px-2 py-1 rounded-sm border transition-colors ${
              enabled ? 'border-moss/40 text-moss hover:bg-moss/10' : 'border-slate/40 text-slate hover:bg-slate/10'
            }`}
          >
            {enabled ? 'Açık' : 'Kapalı'}
          </button>
        </div>
      )}
    </div>
  );
}
