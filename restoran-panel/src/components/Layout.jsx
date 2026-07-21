import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Panel', roles: null, num: '01' },
  { to: '/orders', label: 'Siparişler', roles: null, num: '02' },
  { to: '/tables', label: 'Masalar', roles: null, num: '03' },
  { to: '/payments', label: 'Ödemeler', roles: null, num: '04' },
  { to: '/products', label: 'Ürünler', roles: ['Admin'], num: '05' },
  { to: '/users', label: 'Kullanıcılar', roles: ['Admin'], num: '06' },
];

const ROLE_LABELS = {
  Admin: 'Yönetici',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user?.role)
  );

  return (
    <div className="min-h-screen bg-cream font-body flex">
      {/* Sidebar */}
      <aside className="w-60 bg-ink text-cream flex flex-col shrink-0">
        <div className="px-6 py-6 border-b border-cream/10">
          <p className="font-mono text-[10px] tracking-[0.3em] text-sand/50 uppercase mb-1">
            Restoran
          </p>
          <h1 className="font-display text-xl font-semibold leading-tight">Panel</h1>
        </div>

        <nav className="flex-1 py-4">
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
              <span className="font-mono text-xs text-ember">{item.num}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

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
    </div>
  );
}
