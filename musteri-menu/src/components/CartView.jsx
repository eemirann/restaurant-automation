import { useState } from 'react';
import { calculateLineTotal, money } from '../utils/priceCalculator';

// Sepet + checkout — mockup'taki "Your Order" ekranının karşılığı.
export default function CartView({ products, cart, optionsCache, note, onNoteChange, onEditLine, onSubmit, submitting, error }) {
  const [confirming, setConfirming] = useState(false);

  const entries = Object.entries(cart);

  const lineTotal = (productId, line) => {
    const product = products.find((p) => String(p.ProductId) === String(productId));
    const cat = optionsCache[productId] || { extras: [], syrups: [] };
    return calculateLineTotal(product?.Price, line.quantity, [
      { selections: line.extras, catalogById: new Map(cat.extras.map((o) => [o.ProductId, o])) },
      { selections: line.syrups, catalogById: new Map(cat.syrups.map((o) => [o.ProductId, o])) },
    ]);
  };

  const total = entries.reduce((sum, [productId, line]) => sum + lineTotal(productId, line), 0);

  if (entries.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl mb-4">🛒</p>
        <p className="font-display text-lg font-semibold text-paper mb-1">Sepetiniz boş</p>
        <p className="text-slate text-sm">Menüden ürün ekleyerek başlayın.</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-ember mb-1">Siparişiniz</p>
      <h1 className="font-display text-2xl font-semibold text-paper mb-4">Sepetim</h1>

      <div className="space-y-2 mb-4">
        {entries.map(([productId, line]) => {
          const product = products.find((p) => String(p.ProductId) === String(productId));
          const cat = optionsCache[productId] || { extras: [], syrups: [] };
          const extraLabels = Object.entries(line.extras || {}).map(([id, qty]) => {
            const opt = cat.extras.find((o) => String(o.ProductId) === String(id));
            return opt ? `${qty}x ${opt.Name}` : null;
          }).filter(Boolean);
          const syrupLabels = Object.entries(line.syrups || {}).map(([id, qty]) => {
            const opt = cat.syrups.find((o) => String(o.ProductId) === String(id));
            return opt ? `${qty}x ${opt.Name}` : null;
          }).filter(Boolean);

          return (
            <button
              key={productId}
              type="button"
              onClick={() => onEditLine(product, line)}
              className="w-full text-left border border-hairline rounded-xl bg-panel p-3 hover:border-ember/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-paper font-medium">{line.quantity}x {product?.Name || `Ürün #${productId}`}</span>
                <span className="font-mono text-sm text-paper font-semibold">{money(lineTotal(productId, line))}</span>
              </div>
              {(extraLabels.length > 0 || syrupLabels.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[...extraLabels, ...syrupLabels].map((label, i) => (
                    <span key={i} className="font-mono text-[10px] text-slate border border-hairline rounded-full px-1.5 py-0.5">{label}</span>
                  ))}
                </div>
              )}
              <p className="font-mono text-[10px] text-slate mt-1.5">Düzenlemek için dokun →</p>
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        <label className="block font-mono text-[10px] uppercase tracking-wide text-slate mb-1.5">Mutfağa not (opsiyonel)</label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
          placeholder="ör. Az pişmiş, glutensiz vb."
          className="w-full border border-hairline rounded-lg px-3 py-2.5 bg-panel text-paper text-sm
                     focus:outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
        />
      </div>

      <div className="border-t border-hairline pt-3 flex items-center justify-between mb-4">
        <span className="font-mono text-xs uppercase tracking-widest text-slate">Toplam</span>
        <span className="font-display text-2xl font-semibold text-paper">{money(total)}</span>
      </div>

      {error && (
        <p className="text-ember text-sm font-medium border-l-2 border-ember pl-3 mb-3">{error}</p>
      )}

      {confirming ? (
        <div className="space-y-2">
          <p className="font-mono text-xs text-slate text-center">Siparişi göndermek istediğinize emin misiniz?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 font-mono text-xs uppercase tracking-wide text-slate border border-hairline rounded-full px-4 py-3"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onSubmit}
              className="flex-1 font-mono text-sm uppercase tracking-wide text-cream bg-ember hover:bg-ember/90
                         disabled:opacity-50 rounded-full px-4 py-3 transition-colors"
            >
              {submitting ? 'Gönderiliyor...' : 'Onayla ve Gönder'}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full font-mono text-sm uppercase tracking-wide text-cream bg-ember hover:bg-ember/90
                     rounded-full px-6 py-3.5 min-h-[3rem] transition-colors"
        >
          Siparişi Gönder — {money(total)}
        </button>
      )}
    </div>
  );
}
