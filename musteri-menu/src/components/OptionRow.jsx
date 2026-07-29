import { money } from '../utils/priceCalculator';

// Tek bir ekstra/şurup satırı — adet seçici. restoran-panel'deki
// OptionCard'ın (mode="order") sadeleştirilmiş halidir.
export default function OptionRow({ option, quantity, onIncrement, onDecrement }) {
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
