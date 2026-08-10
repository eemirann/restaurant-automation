import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { useShift } from '../context/ShiftContext';
import CommandPalette from './CommandPalette';
import NotificationCenter from './NotificationCenter';
import client, { imageUrl } from '../api/client';
import { ROLE_LABELS } from '../constants/roles';

// Düz liste ÇOK uzamıştı (22 madde) — ilişkili sayfalar gruplandı:
// "Ürünler" kendi altında Kategoriler'i, "Stok" kendi altında (malzemeyle
// ilgili) Reçeteler/Ekstralar/Şuruplar'ı taşıyor. Gruba tıklamak açar/kapar,
// grubun kendi linki (ör. "Ürünler") ayrıca tıklanabilir sayfa olarak kalır.
const NAV_ITEMS = [
  // Panel (Dashboard) yalnızca yöneticide — kasiyer/garson/mutfak kendi
  // ekranıyla başlar (bkz. constants/roles.js > ROLE_HOME).
  { to: '/', label: 'Panel', roles: ['Admin'], icon: '📊' },
  { to: '/orders', label: 'Siparişler', roles: null, icon: '🧾' },
  { to: '/tables', label: 'Masalar', roles: null, icon: '🍽️' },
  { to: '/reservations', label: 'Rezervasyonlar', roles: null, icon: '📅' },
  { to: '/customer-requests', label: 'Müşteri İstekleri', roles: null, icon: '📱' },
  { to: '/customers', label: 'Müşteriler', roles: ['Admin', 'Cashier'], icon: '🧑‍🤝‍🧑' },
  { to: '/kds', label: 'Mutfak', roles: null, icon: '👨‍🍳' },
  { to: '/payments', label: 'Ödemeler', roles: null, icon: '💳' },
  { to: '/reports', label: 'Raporlar', roles: ['Admin', 'Cashier'], icon: '📈' },
  { to: '/shifts', label: 'Vardiya', roles: null, icon: '🗄️' },
  { to: '/active-shifts', label: 'Aktif Vardiya', roles: ['Admin'], icon: '🟢' },
  {
    key: 'products', label: 'Ürünler', roles: ['Admin'], icon: '☕', to: '/products',
    children: [
      { to: '/products', label: 'Ürünler', roles: ['Admin'], icon: '☕' },
      { to: '/categories', label: 'Kategoriler', roles: ['Admin'], icon: '🗂️' },
    ],
  },
  { to: '/users', label: 'Kullanıcılar', roles: ['Admin'], icon: '👤' },
  {
    key: 'stock', label: 'Stok', roles: ['Admin'], icon: '📦', to: '/stock',
    children: [
      { to: '/stock', label: 'Stok', roles: ['Admin'], icon: '📦' },
      { to: '/recipes', label: 'Reçeteler', roles: ['Admin'], icon: '🧪' },
      { to: '/extras', label: 'Ekstralar', roles: ['Admin'], icon: '🍯' },
      { to: '/syrups', label: 'Şuruplar', roles: ['Admin'], icon: '🍮' },
    ],
  },
  { to: '/invoices', label: 'Faturalar', roles: ['Admin'], icon: '🧾' },
  { to: '/campaigns', label: 'Kampanyalar', roles: ['Admin'], icon: '🎉' },
  { to: '/audit', label: 'Denetim', roles: ['Admin'], icon: '🛡️' },
  { to: '/settings', label: 'Ayarlar', roles: ['Admin'], icon: '⚙️' },
];

// CommandPalette (Ctrl/Cmd+K) hiyerarşiyi bilmez — tüm sayfaları TEK düz
// liste olarak arar, grup başlıkları kendi 'to'suna göre bir kez, çocukları
// ayrı ayrı eklenir (grup başlığının linki zaten ilk çocukla aynı sayfaya
// gittiği için grup satırı burada tekrarlanmaz).
const flattenNavItems = (items) =>
  items.flatMap((item) => (item.children ? item.children : [item]));

// Mutfak rolü kiosk/tablet gibi çalışır: yalnızca Mutfak (KDS) ekranı.
// Rota tarafındaki karşılığı: ProtectedRoute.jsx (başka adrese giderse /kds'e döner).
const KITCHEN_PATHS = ['/kds'];

// Bu sayfalar TAM EKRAN açılır: sol menü ve üst çubuk gizlenir, içerik
// ekranın tamamını kaplar. Sağ alttaki yüzen düğme menüyü geri getirir.
const FULLSCREEN_PATHS = ['/tables'];

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
// Hangi grupların açık/kapalı olduğu — sidebar daralt/genişlet ile AYNI
// desen (localStorage, JSON dizi olarak açık grup key'leri).
const SIDEBAR_OPEN_GROUPS_KEY = 'sidebarOpenGroups';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { RestaurantName, LogoUrl } = useSettings();
  const { shift, closeShift } = useShift();
  const navigate = useNavigate();
  const location = useLocation();

  // Tam ekran sayfalarda kabuk (sol menü + üst çubuk) gizli başlar; yüzen
  // düğmeyle geçici olarak açılır, sayfa değişince yine gizlenir.
  const isFullscreenPage = FULLSCREEN_PATHS.includes(location.pathname);
  const [chromeOpen, setChromeOpen] = useState(false);
  useEffect(() => { setChromeOpen(false); }, [location.pathname]);
  const hideChrome = isFullscreenPage && !chromeOpen;

  // Komut paleti — global Ctrl/Cmd+K kısayolu (bkz. CommandPalette.jsx).
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Sol menü açık/kapalı (simge-sadece) durumu — tarayıcıda saklanır, tema
  // anahtarıyla aynı desen. Büyük ekranda içerik alanına daha fazla yer
  // açmak isteyen kullanıcılar için (bkz. Ayarlar sayfasındaki geniş yerleşim).
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  // Çıkış: açık vardiya varsa kasa sayımı SORULMADAN sessizce kapatılır
  // (mesai kaydı kapanış saatiyle birlikte kalır, bkz. ShiftContext.jsx).
  const handleLogout = async () => {
    if (shift) {
      try { await closeShift(); } catch { /* kapatılamazsa da çıkışı engelleme */ }
    }
    try { await client.post('/auth/logout'); } catch { /* best-effort audit */ }
    logout();
    navigate('/login');
  };

  const canSee = (item) => {
    if (user?.role === 'Kitchen') return KITCHEN_PATHS.includes(item.to);
    return !item.roles || item.roles.includes(user?.role);
  };

  // Gruplar: önce çocuklar role göre süzülür, hiç çocuk kalmazsa grup
  // TAMAMEN gizlenir (boş bir grup başlığı göstermenin anlamı yok).
  const visibleItems = NAV_ITEMS
    .map((item) => (item.children ? { ...item, children: item.children.filter(canSee) } : item))
    .filter((item) => (item.children ? item.children.length > 0 : canSee(item)));

  const paletteItems = flattenNavItems(visibleItems);

  // Bir grup, aktif rota kendi çocuklarından birineyse (URL değişince)
  // otomatik AÇIK sayılır — kullanıcı "Reçeteler"e gidip menüye baktığında
  // grubun kapalı görünmesi kafa karıştırırdı.
  const [openGroups, setOpenGroups] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SIDEBAR_OPEN_GROUPS_KEY)) || []; } catch { return []; }
  });
  const isGroupOpen = (item) =>
    openGroups.includes(item.key) || item.children?.some((c) => c.to === location.pathname);
  const toggleGroup = (key) => {
    setOpenGroups((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem(SIDEBAR_OPEN_GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-charcoal font-body flex">
      {/* Sidebar — tam ekran sayfalarda gizlenir */}
      {!hideChrome && (
      <aside className={`relative bg-ink text-cream flex flex-col shrink-0 transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-60'}`}>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
          className="absolute -right-3 top-7 w-6 h-6 flex items-center justify-center rounded-full
                     bg-ink border border-cream/20 text-sand/70 hover:text-cream hover:border-cream/40
                     transition-colors z-10 text-xs"
        >
          {collapsed ? '›' : '‹'}
        </button>

        <div className={`py-6 border-b border-cream/10 ${collapsed ? 'px-3 text-center' : 'px-6'}`}>
          {!collapsed && !LogoUrl && (
            <p className="font-mono text-[10px] tracking-[0.3em] text-sand/50 uppercase mb-1">
              Restoran
            </p>
          )}
          {LogoUrl ? (
            <img
              src={imageUrl(LogoUrl)}
              alt={RestaurantName || 'Restoran'}
              title={RestaurantName || 'Panel'}
              className={collapsed ? 'w-8 h-8 object-contain mx-auto' : 'max-h-12 max-w-full object-contain'}
            />
          ) : (
            <h1 className="font-display text-xl font-semibold leading-tight truncate" title={RestaurantName || 'Panel'}>
              {collapsed ? (RestaurantName || 'Panel').charAt(0) : (RestaurantName || 'Panel')}
            </h1>
          )}
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleItems.map((item) => {
            if (!item.children) {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 py-3 text-sm font-medium transition-colors border-l-2 ${
                      collapsed ? 'px-0 justify-center' : 'px-6'
                    } ${
                      isActive
                        ? 'border-ember bg-cream/5 text-cream'
                        : 'border-transparent text-slate hover:text-cream hover:bg-cream/5'
                    }`
                  }
                >
                  <span className="text-base leading-none w-5 text-center shrink-0">{item.icon}</span>
                  {!collapsed && item.label}
                </NavLink>
              );
            }

            // Grup: daralt/genişlet modunda ayrım yapmaz, çocuklarını hep
            // düz simge listesi gibi gösterir (grup başlığı gizli kalır) —
            // dar sidebar'da açılır kapanır başlık zaten sığmaz.
            if (collapsed) {
              return item.children.map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  title={child.label}
                  className={({ isActive }) =>
                    `flex items-center justify-center py-3 text-sm font-medium transition-colors border-l-2 px-0 ${
                      isActive
                        ? 'border-ember bg-cream/5 text-cream'
                        : 'border-transparent text-slate hover:text-cream hover:bg-cream/5'
                    }`
                  }
                >
                  <span className="text-base leading-none w-5 text-center shrink-0">{child.icon}</span>
                </NavLink>
              ));
            }

            const open = isGroupOpen(item);
            return (
              <div key={item.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item.key)}
                  className="w-full flex items-center gap-3 py-3 px-6 text-sm font-medium transition-colors border-l-2
                             border-transparent text-slate hover:text-cream hover:bg-cream/5"
                >
                  <span className="text-base leading-none w-5 text-center shrink-0">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className={`text-[10px] text-sand/50 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                </button>
                {open && (
                  <div className="pb-1">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        className={({ isActive }) =>
                          `flex items-center gap-3 py-2.5 pl-12 pr-6 text-sm transition-colors border-l-2 ${
                            isActive
                              ? 'border-ember bg-cream/5 text-cream font-medium'
                              : 'border-transparent text-slate/80 hover:text-cream hover:bg-cream/5'
                          }`
                        }
                      >
                        <span className="text-sm leading-none w-4 text-center shrink-0">{child.icon}</span>
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`py-4 border-t border-cream/10 flex items-center ${collapsed ? 'px-3 justify-center' : 'px-6 justify-between'}`}>
          {!collapsed && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-sand/50">
              {theme === 'dark' ? 'Koyu' : 'Açık'} Mod
            </span>
          )}
          <button
            onClick={toggleTheme}
            role="switch"
            aria-checked={theme === 'dark'}
            title="Açık / Koyu tema"
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
              theme === 'dark' ? 'bg-ember' : 'bg-cream/20'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-cream shadow-sm transition-transform ${
                theme === 'dark' ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className={`py-5 border-t border-cream/10 ${collapsed ? 'px-3 text-center' : 'px-6'}`}>
          {!collapsed && (
            <>
              <p className="font-medium text-sm truncate">{user?.fullName}</p>
              <p className="font-mono text-xs text-sand/50 uppercase tracking-wide mt-0.5">
                {ROLE_LABELS[user?.role] || user?.role}
              </p>
            </>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? 'Çıkış Yap' : undefined}
            className={`text-xs font-mono text-ember hover:text-ember/80 transition-colors uppercase tracking-wide ${collapsed ? 'mt-0' : 'mt-3'}`}
          >
            {collapsed ? '⏻' : 'Çıkış Yap →'}
          </button>
        </div>
      </aside>
      )}

      {/* İçerik */}
      <main className="flex-1 overflow-auto flex flex-col">
        {!hideChrome && (
        <header className="h-14 shrink-0 border-b border-hairline flex items-center justify-end gap-2 px-6">
          <button
            onClick={() => setPaletteOpen(true)}
            title="Komut Paleti (Ctrl/Cmd+K)"
            className="font-mono text-[11px] uppercase tracking-wide text-slate hover:text-paper
                       border border-hairline rounded-sm px-3 py-1.5 transition-colors flex items-center gap-2"
          >
            Ara <kbd className="text-[10px] border border-hairline rounded px-1">Ctrl K</kbd>
          </button>
          <NotificationCenter />
        </header>
        )}
        <div className="flex-1 overflow-auto">{children}</div>
      </main>

      {/* Tam ekran sayfalarda menüyü aç/kapat (Masalar planı için).
          z-40: sayfa içeriğinin üstünde ama modalların (z-50) ALTINDA —
          masa/menü ekranı tam ekran açıkken bu düğme görünmez. */}
      {isFullscreenPage && (
        <button
          onClick={() => setChromeOpen((v) => !v)}
          title={hideChrome ? 'Menüyü göster' : 'Tam ekran'}
          className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-ink text-cream border border-cream/20
                     shadow-lg hover:border-ember hover:text-ember transition-colors flex items-center justify-center text-lg"
        >
          {hideChrome ? '☰' : '⛶'}
        </button>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
    </div>
  );
}
