import { money } from '../utils/priceCalculator';

// Tek bir ekstra/şurup satırı — adet seçici. Beyaz/premium tasarım dili.
export default function OptionRow({ option, quantity, onIncrement, onDecrement }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-ink truncate">{option.Name}</p>
        <p className="text-[11px] text-gold font-medium">+{money(option.Price)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onDecrement}
          disabled={!quantity}
          className="w-7 h-7 flex items-center justify-center text-sm text-muted hover:text-ink
                     border border-line rounded-full select-none disabled:opacity-30"
        >
          −
        </button>
        <span className="text-sm text-ink w-4 text-center select-none">{quantity || 0}</span>
        <button
          type="button"
          onClick={onIncrement}
          className="w-7 h-7 flex items-center justify-center text-sm text-paper bg-ink
                     hover:bg-ink/85 rounded-full select-none"
        >
          +
        </button>
      </div>
    </div>
  );
}
