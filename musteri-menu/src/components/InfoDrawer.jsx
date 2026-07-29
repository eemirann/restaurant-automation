import { useEffect, useState } from 'react';
import client from '../api/client';
import { useLanguage } from '../i18n';

// Sol üstte sabit duran hamburger düğmesi + kafe adı/notu, sosyal medya
// ve iletişim bilgisini gösteren aç/kapa panel. Veri GET /api/settings'ten
// gelir (kimlik doğrulamasız — bkz. routes/settings.js); admin panelinden
// (Ayarlar sayfası) doldurulacak alanlar boşsa ilgili bölüm hiç gösterilmez.
export default function InfoDrawer() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (open && !info) {
      client.get('/settings').then((res) => setInfo(res.data)).catch(() => setInfo({}));
    }
  }, [open, info]);

  const socials = info ? [
    { key: 'instagram', label: 'Instagram', short: 'IG', url: info.SocialInstagram },
    { key: 'facebook', label: 'Facebook', short: 'FB', url: info.SocialFacebook },
    { key: 'x', label: 'X', short: 'X', url: info.SocialX },
    { key: 'whatsapp', label: 'WhatsApp', short: 'WA', url: info.SocialWhatsapp ? `https://wa.me/${info.SocialWhatsapp.replace(/\D/g, '')}` : null },
  ].filter((s) => s.url) : [];

  const hasContact = info && (info.ContactPhone || info.ContactAddress);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-white/90
                   backdrop-blur shadow-card text-ink text-base"
        aria-label={t('openInfo')}
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />

          <div
            className="relative w-[82%] max-w-xs h-full bg-white shadow-lift flex flex-col animate-[infoSlideIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes infoSlideIn {
                from { transform: translateX(-100%); }
                to { transform: translateX(0); }
              }
            `}</style>

            <div className="flex items-start justify-between p-5 pb-3">
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold text-ink leading-tight truncate">
                  {info?.RestaurantName || '—'}
                </h2>
                {info?.CafeNote && (
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">{info.CafeNote}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 bg-cream text-muted hover:text-ink transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {!info ? (
              <p className="px-5 text-xs text-muted">{t('loadingInfo')}</p>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-5">
                {hasContact && (
                  <div className="pt-3 border-t border-line space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold">{t('contact')}</p>
                    {info.ContactPhone && (
                      <a href={`tel:${info.ContactPhone}`} className="block text-sm text-ink hover:text-gold transition-colors">
                        📞 {info.ContactPhone}
                      </a>
                    )}
                    {info.ContactAddress && (
                      <p className="text-sm text-ink leading-relaxed">📍 {info.ContactAddress}</p>
                    )}
                  </div>
                )}

                {socials.length > 0 && (
                  <div className="pt-3 border-t border-line">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-2.5">{t('followUs')}</p>
                    <div className="flex gap-2.5">
                      {socials.map((s) => (
                        <a
                          key={s.key}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-11 h-11 flex items-center justify-center rounded-full bg-cream text-ink text-xs font-semibold
                                     hover:bg-ink hover:text-paper transition-colors"
                          aria-label={s.label}
                        >
                          {s.short}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {!hasContact && socials.length === 0 && (
                  <p className="pt-3 border-t border-line text-xs text-muted">{t('noExtraInfo')}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
