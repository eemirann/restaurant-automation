import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Mutfak (Kitchen) rolü yalnızca fiş ekranını (KDS) ve kendi vardiyasını
// görür — Layout.jsx'teki KITCHEN_ONLY nav listesiyle birebir aynı olmalı.
const KITCHEN_ALLOWED_PATHS = ['/kds', '/shifts'];

// allowedRoles verilmezse, sadece giriş yapmış olmak yeterli.
// Verilirse, kullanıcının rolü listede olmalı.
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'Kitchen' && !KITCHEN_ALLOWED_PATHS.includes(location.pathname)) {
    return <Navigate to="/kds" replace />;
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
