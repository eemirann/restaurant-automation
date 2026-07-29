import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { useShift, SHIFT_ROLES } from '../context/ShiftContext';
import { OpenShiftModal, CloseShiftModal } from './ShiftWorkflow';
import client from '../api/client';

const NAV_ITEMS = [
  { to: '/', label: 'Panel', roles: null, icon: '📊' },
  { to: '/orders', label: 'Siparişler', roles: null, icon: '🧾' },
  { to: '/tables', label: 'Masalar', roles: null, icon: '🍽️' },
  { to: '/reservations', label: 'Rezervasyonlar', roles: null, icon: '📅' },
  { to: '/customer-requests', label: 'Müşteri İstekleri', roles: null, icon: '📱' },
  { to: '/kds', label: 'Mutfak', roles: null, icon: '👨‍🍳' },
  { to: '/payments', label: 'Ödemeler', roles: null, icon: '💳' },
  { to: '/reports', label: 'Raporlar', roles: ['Admin', 'Cashier'], icon: '📈' },
  { to: '/shifts', label: 'Vardiya', roles: null, icon: '🗄️' },
  { to: '/active-shifts', label: 'Aktif Vardiya', roles: ['Admin'], icon: '🟢' },
  { to: '/products', label: 'Ürünler', roles: ['Admin'], icon: '☕' },
  { to: '/categories', label: 'Kategoriler', roles: ['Admin'], icon: '🗂️' },
  { to: '/users', label: 'Kullanıcılar', roles: ['Admin'], icon: '👤' },
  { to: '/stock', label: 'Stok', roles: ['Admin'], icon: '📦' },
  { to: '/recipes', label: 'Reçeteler', roles: ['Admin'], icon: '🧪' },
  { to: '/extras', label: 'Ekstralar', roles: ['Admin'], icon: '🍯' },
  { to: '/syrups', label: 'Şuruplar', roles: ['Admin'], icon: '🍮' },
  { to: '/invoices', label: 'Faturalar', roles: ['Admin'], icon: '🧾' },
  { to: '/campaigns', label: 'Kampanyalar', roles: ['Admin'], icon: '🎉' },
  { to: '/audit', label: 'Denetim', roles: ['Admin'], icon: '🛡️' },
  { to: '/settings', label: 'Ayarlar', roles: ['Admin'], icon: '⚙️' },
];

const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
};

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { RestaurantName } = useSettings();
  const { shift, loading: shiftLoading } = useShift();
  const navigate = useNavigate();
  const [showClose, setShowClose] = useState(false);

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

  // Sadece kasa/servis rolleri (Cashier, Waiter) vardiya açmak zorunda.
  // Admin muaf — kendi kasası olmadan panele erişir, gözetim/override yapar.
  const requiresShift = !!user && SHIFT_ROLES.includes(user.role);
  const mustOpenShift = requiresShift && !shiftLoading && !shift;

  const doLogout = async () => {
    try { await client.post('/auth/logout'); } catch { /* best-effort audit */ }
    logout();
    navigate('/login');
  };

  const handleLogout = () => {
    // Vardiyası açık kasiyer/garson kapatmadan çıkamaz.
    if (requiresShift && shift) { setShowClose(true); return; }
    doLogout();
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user?.role)
  );

  return (
    <div className="min-h-screen bg-charcoal font-body flex">
      {/* Sidebar */}
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
          {!collapsed && (
            <p className="font-mono text-[10px] tracking-[0.3em] text-sand/50 uppercase mb-1">
              Restoran
            </p>
          )}
          <h1 className="font-display text-xl font-semibold leading-tight truncate" title={RestaurantName || 'Panel'}>
            {collapsed ? (RestaurantName || 'Panel').charAt(0) : (RestaurantName || 'Panel')}
          </h1>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleItems.map((item) => (
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
          ))}
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

      {/* İçerik */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Vardiya iş akışı katmanı (yüzen kart kaldırıldı — vardiya bilgisi Dashboard'da) */}
      {mustOpenShift && <OpenShiftModal />}
      {showClose && <CloseShiftModal onCancel={() => setShowClose(false)} onClosed={doLogout} />}
    </div>
  );
}
