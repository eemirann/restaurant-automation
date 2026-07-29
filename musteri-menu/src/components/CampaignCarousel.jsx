import { useEffect, useRef, useState } from 'react';
import { imageUrl } from '../api/client';
import { money } from '../utils/priceCalculator';
import { useLanguage } from '../i18n';

const AUTO_ADVANCE_MS = 4500;
const SWIPE_THRESHOLD_PX = 40;

// QR menünün en üstünde (arama kutusundan önce) gösterilen kampanya/combo
// karüseli. Kampanya boşsa hiç render edilmez. Otomatik kayma + parmakla
// kaydırma birlikte çalışır: manuel kaydırınca otomatik zamanlayıcı
// sıfırlanıp yeniden başlar (çakışmasın diye).
export default function CampaignCarousel({ campaigns, onAddCombo }) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [justAdded, setJustAdded] = useState(false);

  const touchStartX = useRef(null);
  const didSwipe = useRef(false);
  const timerRef = useRef(null);

  const count = campaigns.length;

  const resetTimer = () => {
    clearInterval(timerRef.current);
    if (count > 1) {
      timerRef.current = setInterval(() => {
        setActiveIndex((i) => (i + 1) % count);
      }, AUTO_ADVANCE_MS);
    }
  };

  useEffect(() => {
    setActiveIndex(0);
    resetTimer();
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  if (count === 0) return null;

  const goTo = (idx) => {
    setActiveIndex(((idx % count) + count) % count);
    resetTimer();
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    didSwipe.current = false;
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > SWIPE_THRESHOLD_PX) didSwipe.current = true;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > SWIPE_THRESHOLD_PX) goTo(activeIndex - 1);
    else if (delta < -SWIPE_THRESHOLD_PX) goTo(activeIndex + 1);
    touchStartX.current = null;
  };

  const handleTap = (campaign) => {
    if (didSwipe.current) { didSwipe.current = false; return; }
    if (campaign.CampaignType === 'Combo') setSelectedCampaign(campaign);
    // 'Info' tipinde dokununca bir şey olmaz.
  };

  return (
    <div className="px-5 pt-4">
      <div
        className="relative w-full h-36 rounded-2xl overflow-hidden shadow-card select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {campaigns.map((c, idx) => (
          <button
            key={c.CampaignId}
            type="button"
            onClick={() => handleTap(c)}
            className={`absolute inset-0 w-full h-full text-left transition-opacity duration-300 ${
              idx === activeIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            {c.ImageUrl ? (
              <img src={imageUrl(c.ImageUrl)} alt={c.Title} className="w-full h-full object-cover" draggable={false} />
            ) : (
              <div className="w-full h-full bg-cream flex items-center justify-center text-4xl">🎉</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <p className="text-paper font-display text-base font-semibold leading-tight drop-shadow">{c.Title}</p>
              {c.CampaignType === 'Combo' && (
                <p className="text-gold text-xs font-semibold mt-0.5 drop-shadow">{money(c.ComboPrice)}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {campaigns.map((c, idx) => (
            <button
              key={c.CampaignId}
              type="button"
              onClick={() => goTo(idx)}
              aria-label={`${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${idx === activeIndex ? 'w-5 bg-ink' : 'w-1.5 bg-line'}`}
            />
          ))}
        </div>
      )}

      {selectedCampaign && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50" onClick={() => setSelectedCampaign(null)}>
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[80vh] shadow-lift flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              {selectedCampaign.ImageUrl ? (
                <img src={imageUrl(selectedCampaign.ImageUrl)} alt={selectedCampaign.Title} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-cream flex items-center justify-center text-4xl">🎉</div>
              )}
              <button
                type="button"
                onClick={() => setSelectedCampaign(null)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 text-ink text-sm shadow-card"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink leading-tight">{selectedCampaign.Title}</h3>
                {selectedCampaign.Description && <p className="text-sm text-muted mt-1">{selectedCampaign.Description}</p>}
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-1.5">{t('comboIncludes')}</p>
                <div className="space-y-1">
                  {(selectedCampaign.ComboItems || []).map((item) => (
                    <p key={item.ProductId} className="text-sm text-ink">
                      {item.Quantity}x {item.ProductName}
                    </p>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line">
                <span className="text-xs uppercase tracking-[0.2em] text-muted font-semibold">{t('total')}</span>
                <span className="text-lg text-ink font-semibold">{money(selectedCampaign.ComboPrice)}</span>
              </div>
            </div>

            <div className="shrink-0 p-4 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  onAddCombo(selectedCampaign.ComboOfferId);
                  setJustAdded(true);
                  setTimeout(() => setJustAdded(false), 1200);
                  setSelectedCampaign(null);
                }}
                className="w-full text-sm uppercase tracking-[0.15em] font-semibold text-paper bg-ink hover:bg-ink/90
                           rounded-full px-6 py-3.5 min-h-[3rem] transition-colors"
              >
                {justAdded ? t('addedToCart') : t('addComboToCart')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
