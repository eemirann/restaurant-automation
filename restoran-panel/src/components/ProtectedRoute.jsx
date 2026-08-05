import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../constants/roles';

// Mutfak rolünün girebileceği tek adres. Kiosk/tablet kullanımı için:
// Kitchen kullanıcısı hangi adrese giderse gitsin Mutfak ekranına döner
// (sol menüdeki karşılığı: Layout.jsx > KITCHEN_PATHS).
const KITCHEN_HOME = '/kds';

// Panel (Dashboard) yalnızca yöneticiye açık — diğer roller '/' adresine
// gitse bile kendi açılış sayfasına yönlenir (bkz. constants/roles.js).
const DASHBOARD_PATH = '/';

// allowedRoles verilmezse, sadece giriş yapmış olmak yeterli.
// Verilirse, kullanıcının rolü listede olmalı.
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'Kitchen' && location.pathname !== KITCHEN_HOME) {
    return <Navigate to={KITCHEN_HOME} replace />;
  }

  if (location.pathname === DASHBOARD_PATH && user.role !== 'Admin') {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center font-body">
        <div className="text-center">
          <p className="font-display text-2xl text-paper mb-2">Erişim yok</p>
          <p className="text-slate">Bu sayfayı görüntüleme yetkin bulunmuyor.</p>
        </div>
      </div>
    );
  }

  return children;
}
