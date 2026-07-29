const TABS = [
  { key: 'menu', label: 'Menü', icon: '🍽️' },
  { key: 'cart', label: 'Sepet', icon: '🛒' },
  { key: 'staff', label: 'Çağır', icon: '🔔' },
];

export default function BottomNav({ active, onChange, cartCount, hasAlert }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-panel border-t border-hairline flex z-40
                 pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-colors ${
            active === tab.key ? 'text-ember' : 'text-slate'
          }`}
        >
          <span className="text-xl leading-none relative">
            {tab.icon}
            {tab.key === 'cart' && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 w-4 h-4 flex items-center justify-center rounded-full bg-ember text-cream text-[9px] font-mono font-semibold">
                {cartCount}
              </span>
            )}
            {tab.key === 'staff' && hasAlert && (
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-ember" />
            )}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wide">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
