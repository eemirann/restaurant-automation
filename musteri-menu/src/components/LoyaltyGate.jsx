import { useState } from 'react';
import { useLanguage } from '../i18n';

const DISMISS_KEY = 'loyaltyGateDismissed'; // sessionStorage — bu ziyarette bir daha nagleme

// ============================================================
// Giriş yapmamış müşterilere gösterilen opsiyonel banner + modal.
// "Şimdi değil" ile kapatılırsa bu OTURUM boyunca (sessionStorage) bir
// daha gösterilmez; hesap açılır/girilirse bileşen zaten hiç render
// edilmez (bkz. MenuApp.jsx: loyalty.account varsa gate hiç basılmaz).
// ============================================================
export default function LoyaltyGate({ loyalty }) {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');
  const [open, setOpen] = useState(false);

  if (dismissed) return null;

  const skip = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <>
      <div className="mx-4 mt-3 rounded-2xl bg-white shadow-card p-4 flex items-center gap-3">
        <span className="text-2xl shrink-0">🎁</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink leading-tight">{t('loyaltyGateTitle')}</p>
          <p className="text-xs text-muted leading-snug mt-0.5">{t('loyaltyGateBody')}</p>
        </div>
        <button
          type="button"
          onClick={skip}
          className="text-muted text-lg leading-none shrink-0 px-1"
          aria-label={t('loyaltyGateSkip')}
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-4 mt-2 w-[calc(100%-2rem)] text-xs uppercase tracking-[0.15em] font-semibold text-paper
                   bg-ink hover:bg-ink/90 rounded-full py-2.5 transition-colors"
      >
        {t('loyaltyGateCta')}
      </button>

      {open && <LoyaltyModal loyalty={loyalty} onClose={() => setOpen(false)} onSuccess={() => setOpen(false)} />}
    </>
  );
}

// ============================================================
// Giriş/kayıt modalı — CartView'da tekrar giriş yapmak isteyen (ör.
// yeni bir masada/cihazda) müşteriler için de dışa aktarılır.
// ============================================================
export function LoyaltyModal({ loyalty, onClose, onSuccess }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    loyalty.clearError();
    const trimmed = username.trim();
    if (!trimmed || !pin) return;
    const ok = tab === 'login' ? await loyalty.login(trimmed, pin) : await loyalty.register(trimmed, pin);
    if (ok) onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div
        className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-lift p-6 animate-[infoSlideIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 bg-cream rounded-full p-1">
            {['login', 'register'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setTab(k); loyalty.clearError(); }}
                className={`text-xs font-semibold uppercase tracking-wide rounded-full px-4 py-1.5 transition-colors ${
                  tab === k ? 'bg-ink text-paper' : 'text-muted'
                }`}
              >
                {k === 'login' ? t('loyaltyTabLogin') : t('loyaltyTabRegister')}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="text-muted text-lg" aria-label={t('close')}>✕</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-1.5">
              {t('usernameLabel')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('usernamePlaceholder')}
              maxLength={50}
              autoFocus
              className="w-full border border-line rounded-2xl px-4 py-2.5 bg-cream text-ink text-sm placeholder:text-muted
                         focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-muted font-semibold mb-1.5">
              {t('loyaltyPinLabel')}
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('loyaltyPinPlaceholder')}
              className="w-full border border-line rounded-2xl px-4 py-2.5 bg-cream text-ink text-sm placeholder:text-muted
                         focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold tracking-[0.3em]"
            />
            {tab === 'register' && <p className="text-[11px] text-muted mt-1.5">{t('loyaltyRegisterHint')}</p>}
          </div>

          {loyalty.error && <p className="text-danger text-xs font-medium">{loyalty.error}</p>}

          <button
            type="submit"
            disabled={loyalty.loading || !username.trim() || !pin}
            className="w-full text-xs uppercase tracking-[0.15em] font-semibold text-paper bg-ink hover:bg-ink/90
                       disabled:opacity-50 rounded-full py-3 transition-colors mt-1"
          >
            {loyalty.loading ? t('loading') : tab === 'login' ? t('loyaltySubmitLogin') : t('loyaltySubmitRegister')}
          </button>
        </form>
      </div>
    </div>
  );
}
