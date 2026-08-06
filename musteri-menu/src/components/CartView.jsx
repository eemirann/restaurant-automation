import { useState, useEffect } from 'react';
import { calculateLineTotal, money } from '../utils/priceCalculator';
import { useLanguage } from '../i18n';

const TIP_PRESETS = [0, 0.05, 0.10, 0.15];

// Sepet + checkout. Beyaz/premium tasarım dili.
export default function CartView({
  products, cart, optionsCache, campaigns = [], comboCart = {}, onComboQuantityChange, onRemoveCombo,
  note, onNoteChange, username, onUsernameChange, loyalty, onTipAmountChange, onEditLine, onSubmit, submitting, error,
  closed = false,
}) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const [tipPreset, setTipPreset] = useState(0);
  const [customTip, setCustomTip] = useState('');

  const entries = Object.entries(cart);
  const comboEntries = Object.entries(comboCart)
    .map(([comboOfferId, quantity]) => {
      const campaign = campaigns.find((c) => String(c.ComboOfferId) === String(comboOfferId));
      return campaign ? { comboOfferId, quantity, campaign } : null;
    })
    .filter(Boolean);

  const lineTotal = (productId, line) => {
    const product = products.find((p) => String(p.ProductId) === String(productId));
    const cat = optionsCache[productId] || { extras: [], syrups: [] };
    return calculateLineTotal(product?.Price, line.quantity, [
      { selections: line.extras, catalogById: new Map(cat.extras.map((o) => [o.ProductId, o])) },
      { selections: line.syrups, catalogById: new Map(cat.syrups.map((o) => [o.ProductId, o])) },
    ]);
  };

  const itemsTotal = entries.reduce((sum, [productId, line]) => sum + lineTotal(productId, line), 0);
  const combosTotal = comboEntries.reduce((sum, { quantity, campaign }) => sum + Number(campaign.ComboPrice) * quantity, 0);
  const subtotal = itemsTotal + combosTotal;

  const effectiveTip = customTip !== '' ? Number(customTip) || 0 : Math.round(subtotal * tipPreset * 100) / 100;
  const total = subtotal + effectiveTip;

  const selectPreset = (pct) => {
    setTipPreset(pct);
    setCustomTip('');
  };

  useEffect(() => {
    onTipAmountChange?.(effectiveTip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTip]);

  if (entries.length === 0 && comboEntries.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl mb-4">🛒</p>
        <p className="font-display text-lg font-semibold text-ink mb-1">{t('emptyCartTitle')}</p>
        <p className="text-muted text-sm">{t('emptyCartBody')}</p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <p className="text-[11px] uppercase tracking-[0.25em] text-gold font-semibold mb-1.5">{t('yourOrderLabel')}</p>
      <h1 className="font-display text-3xl font-semibold text-ink mb-5 leading-tight">{t('cartTitle')}</h1>

      <div className="space-y-2.5 mb-5">
        {comboEntries.map(({ comboOfferId, quantity, campaign }) => (
          <div key={`combo-${comboOfferId}`} className="rounded-2xl bg-white shadow-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-ink font-medium">{campaign.Title}</span>
              <span className="text-sm text-ink font-semibold">{money(campaign.ComboPrice * quantity)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(campaign.ComboItems || []).map((item) => (
                <span key={item.ProductId} className="text-[11px] text-muted border border-line rounded-full px-2 py-0.5">
                  {item.Quantity}x {item.ProductName}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onComboQuantityChange(comboOfferId, -1)}
                  className="w-8 h-8 flex items-center justify-center text-base text-muted hover:text-ink border border-line rounded-full select-none"
                >
                  −
                </button>
                <span className="text-sm text-ink w-4 text-center">{quantity}</span>
                <button
                  type="button"
                  onClick={() => onComboQuantityChange(comboOfferId, 1)}
                  className="w-8 h-8 flex items-center justify-center text-base text-paper bg-ink hover:bg-ink/85 rounded-full select-none"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemoveCombo(comboOfferId)}
                className="text-[11px] uppercase tracking-wide font-semibold text-muted hover:text-danger"
              >
                {t('removeFromCart')}
              </button>
            </div>
          </div>
        ))}

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
              className="w-full text-left rounded-2xl bg-white shadow-card hover:shadow-lift p-4 transition-shadow"
            >
              <div className="flex items-center justify-between">
                <span className="text-ink font-medium">{line.quantity}x {product?.Name || `Ürün #${productId}`}</span>
                <span className="text-sm text-ink font-semibold">{money(lineTotal(productId, line))}</span>
              </div>
              {(extraLabels.length > 0 || syrupLabels.length > 0) && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[...extraLabels, ...syrupLabels].map((label, i) => (
                    <span key={i} className="text-[11px] text-muted border border-line rounded-full px-2 py-0.5">{label}</span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted mt-2">{t('tapToEdit')}</p>
            </button>
          );
        })}
      </div>

      <div className="mb-5">
        <label className="block text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-1.5">{t('kitchenNoteLabel')}</label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
          placeholder={t('kitchenNotePlaceholder')}
          className="w-full border border-line rounded-2xl px-4 py-3 bg-cream text-ink text-sm placeholder:text-muted
                     focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
        />
      </div>

      <div className="mb-5">
        <label className="block text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-1.5">{t('usernameLabel')}</label>
        <input
          type="text"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder={t('usernamePlaceholder')}
          maxLength={50}
          className="w-full border border-line rounded-2xl px-4 py-3 bg-cream text-ink text-sm placeholder:text-muted
                     focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
        />
        {loyalty?.account && username === loyalty.account.username && (
          <p className="text-[11px] text-muted mt-1.5">{t('loyaltyLoggedInHint', { username: loyalty.account.username })}</p>
        )}
      </div>

      <div className="mb-5">
        <label className="block text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-1.5">{t('tipLabel')}</label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {TIP_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => selectPreset(pct)}
              className={`text-xs uppercase tracking-wide font-semibold rounded-full px-2 py-2.5 border transition-colors ${
                customTip === '' && tipPreset === pct ? 'border-gold bg-gold/10 text-ink' : 'border-line text-muted'
              }`}
            >
              {pct === 0 ? t('tipNone') : `%${Math.round(pct * 100)}`}
            </button>
          ))}
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={customTip}
          onChange={(e) => setCustomTip(e.target.value)}
          placeholder={t('tipCustomPlaceholder')}
          className="w-full border border-line rounded-2xl px-4 py-3 bg-cream text-ink text-sm placeholder:text-muted
                     focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
        />
      </div>

      <div className="border-t border-line pt-4 mb-5">
        <div className="flex items-center justify-between text-sm text-muted mb-1">
          <span>{t('subtotalLabel')}</span>
          <span>{money(subtotal)}</span>
        </div>
        {effectiveTip > 0 && (
          <div className="flex items-center justify-between text-sm text-muted mb-1">
            <span>{t('tipLabel')}</span>
            <span>{money(effectiveTip)}</span>
          </div>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs uppercase tracking-[0.2em] text-muted font-semibold">{t('total')}</span>
          <span className="font-display text-2xl font-semibold text-ink">{money(total)}</span>
        </div>
      </div>

      {error && (
        <p className="text-danger text-sm font-medium border-l-2 border-danger pl-3 mb-3">{error}</p>
      )}

      {confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-muted text-center">{t('confirmSendQuestion')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 text-xs uppercase tracking-[0.15em] font-semibold text-muted border border-line rounded-full px-4 py-3.5"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={submitting || closed}
              onClick={onSubmit}
              className="flex-1 text-sm uppercase tracking-[0.15em] font-semibold text-paper bg-ink hover:bg-ink/90
                         disabled:opacity-50 rounded-full px-4 py-3.5 transition-colors"
            >
              {submitting ? t('sending') : t('confirmAndSend')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {closed && (
            <p className="text-xs text-center text-muted mb-2">{t('closedOrderBlocked')}</p>
          )}
          <button
            type="button"
            disabled={closed}
            onClick={() => setConfirming(true)}
            className="w-full text-sm uppercase tracking-[0.15em] font-semibold text-paper bg-ink hover:bg-ink/90
                       disabled:opacity-40 rounded-full px-6 py-4 min-h-[3rem] transition-colors"
          >
            {t('sendOrder')} — {money(total)}
          </button>
        </>
      )}
    </div>
  );
}
