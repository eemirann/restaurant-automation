import { useLanguage } from '../i18n';

const TABS = [
  { key: 'menu', labelKey: 'navMenu', icon: '🍽️' },
  { key: 'cart', labelKey: 'navCart', icon: '🛒' },
  { key: 'staff', labelKey: 'navCall', icon: '🔔' },
];

export default function BottomNav({ active, onChange, cartCount, hasAlert }) {
  const { t } = useLanguage();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-line flex z-40
                 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(21,19,15,0.05)]"
    >
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 relative transition-colors ${
            active === tab.key ? 'text-ink' : 'text-muted'
          }`}
        >
          <span className="text-xl leading-none relative">
            {tab.icon}
            {tab.key === 'cart' && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 w-4 h-4 flex items-center justify-center rounded-full bg-gold text-paper text-[9px] font-semibold">
                {cartCount}
              </span>
            )}
            {tab.key === 'staff' && hasAlert && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-gold" />
            )}
          </span>
          <span className="text-[10px] uppercase tracking-wide font-medium">{t(tab.labelKey)}</span>
          {active === tab.key && <span className="absolute top-0 w-8 h-0.5 rounded-full bg-ink" />}
        </button>
      ))}
    </nav>
  );
}
