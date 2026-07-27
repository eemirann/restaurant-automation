import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useShift } from '../context/ShiftContext';
import { OpenShiftModal, CloseShiftModal } from './ShiftWorkflow';
import client from '../api/client';

const NAV_ITEMS = [
  { to: '/', label: 'Panel', roles: null, icon: '📊' },
  { to: '/orders', label: 'Siparişler', roles: null, icon: '🧾' },
  { to: '/tables', label: 'Masalar', roles: null, icon: '🍽️' },
  { to: '/kds', label: 'Mutfak', roles: null, icon: '👨‍🍳' },
  { to: '/payments', label: 'Ödemeler', roles: null, icon: '💳' },
  { to: '/reports', label: 'Raporlar', roles: ['Admin', 'Cashier'], icon: '📈' },
  { to: '/shifts', label: 'Vardiya', roles: null, icon: '🗄️' },
  { to: '/active-shifts', label: 'Aktif Vardiya', roles: ['Admin'], icon: '🟢' },
  { to: '/products', label: 'Ürünler', roles: ['Admin'], icon: '☕' },
  { to: '/users', label: 'Kullanıcılar', roles: ['Admin'], icon: '👤' },
  { to: '/stock', label: 'Stok', roles: ['Admin'], icon: '📦' },
  { to: '/recipes', label: 'Reçeteler', roles: ['Admin'], icon: '🧪' },
  { to: '/audit', label: 'Denetim', roles: ['Admin'], icon: '🛡️' },
];

const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { shift, loading: shiftLoading } = useShift();
  const navigate = useNavigate();
  const [showClose, setShowClose] = useState(false);

  // Giriş yapan HER kullanıcı vardiya açar (rol ayrımı yok).
  const requiresShift = !!user;
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
      <aside className="w-60 bg-ink text-cream flex flex-col shrink-0">
        <div className="px-6 py-6 border-b border-cream/10">
          <p className="font-mono text-[10px] tracking-[0.3em] text-sand/50 uppercase mb-1">
            Restoran
          </p>
          <h1 className="font-display text-xl font-semibold leading-tight">Panel</h1>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors border-l-2 ${
                  isActive
                    ? 'border-ember bg-cream/5 text-cream'
                    : 'border-transparent text-sand/70 hover:text-cream hover:bg-cream/5'
                }`
              }
            >
              <span className="text-base leading-none w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-cream/10 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wide text-sand/50">
            {theme === 'dark' ? 'Koyu' : 'Açık'} Mod
          </span>
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

        <div className="px-6 py-5 border-t border-cream/10">
          <p className="font-medium text-sm truncate">{user?.fullName}</p>
          <p className="font-mono text-xs text-sand/50 uppercase tracking-wide mt-0.5">
            {ROLE_LABELS[user?.role] || user?.role}
          </p>
          <button
            onClick={handleLogout}
            className="mt-3 text-xs font-mono text-ember hover:text-ember/80 transition-colors uppercase tracking-wide"
          >
            Çıkış Yap →
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
